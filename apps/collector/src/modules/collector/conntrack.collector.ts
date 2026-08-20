/**
 * Conntrack Collector
 *
 * Polls /proc/net/nf_conntrack on a remote router (e.g. iStoreOS/OpenWrt)
 * via SSH to collect per-connection traffic data. Unlike the Clash and
 * Surge collectors which read from a proxy gateway API, this collector reads
 * the kernel's conntrack table directly — capturing ALL traffic that passes
 * through the router's NAT, not just proxied traffic.
 *
 * Design principles:
 * - Non-intrusive: only reads /proc/net/nf_conntrack and /tmp/dhcp.leases
 *   via SSH; does NOT modify any router configuration.
 * - Uses SSH key authentication (no password prompts).
 * - Polling interval default 3s (configurable).
 * - Delta calculation: tracks byte counters per connection between polls.
 * - Device name resolution: reads /tmp/dhcp.leases for IP→hostname mapping.
 * - Domain resolution: conntrack only has IPs (no domains). The dashboard
 *   will show IP addresses instead of domains for conntrack traffic.
 *
 * The collector produces TrafficUpdate entries compatible with the existing
 * BatchBuffer / RealtimeStore / database schema, so all existing dashboards
 * work without modification.
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { StatsDatabase } from "../db/db.js";
import type { GeoIPService } from "../geo/geo.service.js";
import type { GeoLocation } from "../geo/geo.service.js";
import { TrafficWriteError } from "../clickhouse/clickhouse.writer.js";
import { realtimeStore } from "../realtime/realtime.store.js";
import { calculateBackoffDelay } from "../../shared/utils/backoff.js";
import { BatchBuffer, type TrafficUpdate } from "./batch-buffer.js";

const execAsync = promisify(exec);

const DEBUG_CONNTRACK = process.env.DEBUG_CONNTRACK === "true";
const STALE_CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 2 * 60 * 1000; // 2 minutes

export interface ConntrackCollectorOptions {
  /** SSH host (e.g. "192.168.1.146") */
  host: string;
  /** SSH port (default 22) */
  port?: number;
  /** SSH username (default "root") */
  username?: string;
  /** Path to SSH private key (default "~/.ssh/id_ed25519_istoreos") */
  privateKeyPath?: string;
  /** Polling interval in ms (default 3000) */
  pollInterval?: number;
  onData?: (data: ConntrackSnapshot) => void;
  onError?: (error: Error) => void;
}

/** A parsed conntrack entry */
interface ConntrackEntry {
  proto: string;
  srcIP: string;
  srcPort: number;
  dstIP: string;
  dstPort: number;
  /** Bytes from src to dst (orig direction) */
  origBytes: number;
  /** Bytes from dst to src (reply direction) */
  replyBytes: number;
  /** State: ESTABLISHED, TIME_WAIT, SYN_SENT, etc. */
  state: string;
  /** IP family: "ipv4" or "ipv6" */
  family: string;
}

/** Snapshot of all conntrack entries + dhcp leases at a point in time */
interface ConntrackSnapshot {
  timestamp: number;
  entries: ConntrackEntry[];
  /** Raw /tmp/dhcp.leases content (parsed by caller) */
  leasesRaw: string;
  totalConnections: number;
}

/** Tracked connection for delta calculation */
interface TrackedConnection {
  /** Unique key: proto:srcIP:srcPort:dstIP:dstPort */
  key: string;
  proto: string;
  srcIP: string;
  srcPort: number;
  dstIP: string;
  dstPort: number;
  state: string;
  family: string;
  lastOrigBytes: number;
  lastReplyBytes: number;
  lastSeen: number;
}

/** SSH connection parameters extracted from backend config */
interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
}

/**
 * Build an SSH command string for the given config and remote command.
 * Centralized to avoid duplication.
 */
function buildSSHCommand(ssh: SSHConfig, remoteCmd: string): string {
  return [
    "ssh",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes",
    "-i", ssh.privateKeyPath,
    "-p", String(ssh.port),
    `${ssh.username}@${ssh.host}`,
    `'${remoteCmd}'`,
  ].join(" ");
}

export class ConntrackCollector {
  private ssh: SSHConfig;
  private pollInterval: number;
  private onData?: (data: ConntrackSnapshot) => void;
  private onError?: (error: Error) => void;
  private pollTimer: NodeJS.Timeout | null = null;
  private isClosing = false;
  private backendId: number;
  private consecutiveErrors = 0;
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly MAX_RETRY_DELAY = 60000;
  private readonly BASE_RETRY_DELAY = 2000;

  constructor(backendId: number, options: ConntrackCollectorOptions) {
    this.backendId = backendId;
    this.ssh = {
      host: options.host,
      port: options.port ?? 22,
      username: options.username ?? "root",
      privateKeyPath:
        options.privateKeyPath ||
        process.env.HOME + "/.ssh/id_ed25519_istoreos",
    };
    this.pollInterval = options.pollInterval ?? 3000;
    this.onData = options.onData;
    this.onError = options.onError;
  }

  start() {
    if (this.isClosing) return;

    console.info(
      `[ConntrackCollector:${this.backendId}] Starting SSH polling ${this.ssh.username}@${this.ssh.host}:${this.ssh.port}...`,
    );

    this.poll();
  }

  private async poll() {
    if (this.isClosing) return;

    try {
      const data = await this.fetchConntrackWithRetry();
      if (data) {
        this.onData?.(data);
        if (this.consecutiveErrors > 0) {
          console.info(
            `[ConntrackCollector:${this.backendId}] Recovered after ${this.consecutiveErrors} errors`,
          );
          this.consecutiveErrors = 0;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.consecutiveErrors++;
      console.error(
        `[ConntrackCollector:${this.backendId}] Poll error (${this.consecutiveErrors}/${this.MAX_RETRY_ATTEMPTS}):`,
        error.message,
      );
      this.onError?.(error);
    }

    if (!this.isClosing) {
      const delay =
        this.consecutiveErrors > 0
          ? calculateBackoffDelay(
              this.consecutiveErrors - 1,
              this.BASE_RETRY_DELAY,
              this.MAX_RETRY_DELAY,
            )
          : this.pollInterval;

      this.pollTimer = setTimeout(() => this.poll(), delay);
    }
  }

  private async fetchConntrackWithRetry(): Promise<ConntrackSnapshot | null> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.fetchConntrack();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === this.MAX_RETRY_ATTEMPTS - 1) break;
        const delay = calculateBackoffDelay(
          attempt,
          this.BASE_RETRY_DELAY,
          this.MAX_RETRY_DELAY,
        );
        if (DEBUG_CONNTRACK) {
          console.log(
            `[ConntrackCollector:${this.backendId}] Retrying in ${delay}ms (attempt ${attempt + 2}/${this.MAX_RETRY_ATTEMPTS})`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private async fetchConntrack(): Promise<ConntrackSnapshot> {
    // Read conntrack + dhcp leases in a single SSH call to minimize overhead
    const remoteCmd =
      "cat /proc/net/nf_conntrack 2>/dev/null; echo '---LEASES---'; cat /tmp/dhcp.leases 2>/dev/null";
    const sshCmd = buildSSHCommand(this.ssh, remoteCmd);

    const { stdout } = await execAsync(sshCmd, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024, // 10MB for large conntrack tables
    });

    const [conntrackRaw, leasesRaw] = stdout.split("---LEASES---");
    const entries = parseConntrack(conntrackRaw || "");

    return {
      timestamp: Date.now(),
      entries,
      leasesRaw: (leasesRaw || "").trim(),
      totalConnections: entries.length,
    };
  }

  stop() {
    this.isClosing = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.info(`[ConntrackCollector:${this.backendId}] Stopped`);
  }
}

/**
 * Parse /proc/net/nf_conntrack output into structured entries.
 *
 * Example line:
 *   ipv4  2 tcp  6 7384 ESTABLISHED src=192.168.1.147 dst=218.103.147.94 sport=59246 dport=16881 packets=8 bytes=1626 src=218.103.147.94 dst=123.121.15.121 sport=16881 dport=59246 packets=9 bytes=1623 [ASSURED] mark=0 zone=0 use=2
 *
 * Key fields extracted:
 * - family (ipv4/ipv6)
 * - proto (tcp/udp/etc)
 * - state (ESTABLISHED/TIME_WAIT/etc) — only for tcp
 * - src=, dst=, sport=, dport= (orig direction)
 * - bytes= (orig direction, after packets=)
 * - The second set of src=/dst=/sport=/dport=/bytes= is the reply direction
 */
export function parseConntrack(raw: string): ConntrackEntry[] {
  const lines = raw.trim().split("\n");
  const entries: ConntrackEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse family and protocol
    const parts = trimmed.split(/\s+/);
    const family = parts[0]; // ipv4 or ipv6
    const proto = parts[2]; // tcp, udp, etc

    // Find state for TCP (4th field after l4proto number)
    let state = "UNKNOWN";
    if (proto === "tcp") {
      // tcp lines: ipv4 2 tcp 6 <timeout> <STATE> src=...
      // parts[0]=family parts[1]=nr parts[2]=proto parts[3]=l4proto_nr parts[4]=timeout parts[5]=STATE
      if (parts[5]) {
        state = parts[5];
      }
    }

    // Extract orig direction (first src=/dst=/sport=/dport=/bytes=)
    const origSrc = extractValue(trimmed, "src=", 1);
    const origDst = extractValue(trimmed, "dst=", 1);
    const origSport = extractValue(trimmed, "sport=", 1);
    const origDport = extractValue(trimmed, "dport=", 1);
    const origBytes = extractValue(trimmed, "bytes=", 1);

    // Extract reply direction (second occurrence)
    const replyBytes = extractValue(trimmed, "bytes=", 2);

    if (!origSrc || !origDst) continue;

    entries.push({
      proto,
      srcIP: origSrc,
      srcPort: parseInt(origSport || "0", 10),
      dstIP: origDst,
      dstPort: parseInt(origDport || "0", 10),
      origBytes: parseInt(origBytes || "0", 10),
      replyBytes: parseInt(replyBytes || "0", 10),
      state,
      family,
    });
  }

  return entries;
}

/** Extract the Nth occurrence of key=value from a conntrack line */
function extractValue(line: string, key: string, occurrence: number): string | null {
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = line.indexOf(key, idx + 1);
    if (idx === -1) return null;
  }
  // idx points to the start of key=, value follows
  const start = idx + key.length;
  const end = line.indexOf(" ", start);
  if (end === -1) {
    return line.slice(start);
  }
  return line.slice(start, end);
}

/**
 * Parse /tmp/dhcp.leases file.
 * Format: <expiry> <mac> <ip> <hostname> <client_id>
 * Lines with hostname "*" have no name.
 *
 * Returns a Map<ip, hostname>
 */
export function parseDhcpLeases(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = raw.trim().split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4) {
      const ip = parts[2];
      const hostname = parts[3];
      if (ip && hostname && hostname !== "*") {
        map.set(ip, hostname);
      }
    }
  }
  return map;
}

/**
 * Check if an IP is private/local (RFC 1918 + link-local + loopback).
 * Used to filter out internal connections from traffic stats.
 */
function isPrivateIP(ip: string): boolean {
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 link-local and ULA
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip === "::1") return true;
  return false;
}

/**
 * Create a conntrack collector that integrates with the existing neko-master
 * data pipeline (BatchBuffer, RealtimeStore, database).
 *
 * The `url` field from backend config contains the SSH target in the format
 * "ssh://user@host:port". The `token` field stores the path to the SSH private key.
 */
export function createConntrackCollector(
  db: StatsDatabase,
  url: string,
  token?: string,
  geoService?: GeoIPService,
  onTrafficUpdate?: () => void,
  backendId?: number,
) {
  const id = backendId || 0;
  const activeConnections = new Map<string, TrackedConnection>();
  const batchBuffer = new BatchBuffer();
  const deviceMap = new Map<string, string>(); // IP → hostname
  let lastBroadcastTime = 0;
  const broadcastThrottleMs = 500;
  let flushInterval: NodeJS.Timeout | null = null;
  let cleanupInterval: NodeJS.Timeout | null = null;
  const FLUSH_INTERVAL_MS = parseInt(process.env.FLUSH_INTERVAL_MS || "30000");
  let isFlushing = false;
  let lastPruneTime = 0;
  const PRUNE_INTERVAL_MS = 60_000;

  // Parse SSH connection info from url/token
  const ssh = parseSSHUrl(url, token);

  const cleanupStaleConnections = () => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, conn] of activeConnections) {
      if (now - conn.lastSeen > STALE_CONNECTION_TIMEOUT) {
        activeConnections.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0 && DEBUG_CONNTRACK) {
      console.log(
        `[ConntrackCollector:${id}] Cleaned up ${cleaned} stale connections`,
      );
    }
  };

  const flushBatch = async () => {
    if (isFlushing || !batchBuffer.hasPending()) return;

    isFlushing = true;
    try {
      const stats = batchBuffer.flush(db, geoService, id, "ConntrackCollector");

      let trafficDetailOk = true;
      let trafficAggOk = true;
      if (stats.pendingTrafficWrite) {
        try {
          const outcome = await stats.pendingTrafficWrite;
          trafficDetailOk = outcome.detailOk;
          trafficAggOk = outcome.aggOk;
        } catch (err) {
          if (err instanceof TrafficWriteError) {
            trafficDetailOk = err.detailOk;
            trafficAggOk = err.aggOk;
          } else {
            trafficDetailOk = false;
            trafficAggOk = false;
          }
          console.warn(
            `[ConntrackCollector:${id}] ClickHouse traffic write failed detail_ok=${trafficDetailOk} agg_ok=${trafficAggOk}`,
            err,
          );
        }
      }

      // Durable fallback to SQLite
      if (
        stats.hasTrafficUpdates &&
        stats.trafficOk &&
        stats.sqliteSkipped &&
        (!trafficDetailOk || !trafficAggOk)
      ) {
        try {
          db.batchUpdateTrafficStats(id, stats.updates, false);
          trafficDetailOk = true;
          trafficAggOk = true;
          console.warn(
            `[ConntrackCollector:${id}] ClickHouse traffic write failed; persisted ${stats.updates.length} updates to SQLite as fallback`,
          );
        } catch (fallbackErr) {
          console.error(
            `[ConntrackCollector:${id}] SQLite fallback for traffic also failed; retaining realtime store`,
            fallbackErr,
          );
        }
      }

      if (stats.hasTrafficUpdates && stats.trafficOk) {
        if (trafficDetailOk && trafficAggOk) {
          realtimeStore.clearTraffic(id);
        } else if (trafficDetailOk && !trafficAggOk) {
          realtimeStore.clearTrafficDimensions(id);
        } else if (!trafficDetailOk && trafficAggOk) {
          realtimeStore.clearTrafficSummary(id);
        }
      }

      let countryWriteOk = true;
      if (stats.pendingCountryWrite) {
        try {
          await stats.pendingCountryWrite;
        } catch (err) {
          countryWriteOk = false;
          console.warn(
            `[ConntrackCollector:${id}] ClickHouse country write failed, keeping realtime country store`,
            err,
          );
        }
      }

      if (
        stats.hasCountryUpdates &&
        stats.countryOk &&
        stats.sqliteSkipped &&
        !countryWriteOk
      ) {
        try {
          db.batchUpdateCountryStats(id, stats.countryUpdates);
          countryWriteOk = true;
          console.warn(
            `[ConntrackCollector:${id}] ClickHouse country write failed; persisted to SQLite as fallback`,
          );
        } catch (fallbackErr) {
          console.error(
            `[ConntrackCollector:${id}] SQLite fallback for country also failed; retaining realtime store`,
            fallbackErr,
          );
        }
      }

      if (stats.hasCountryUpdates && stats.countryOk && countryWriteOk) {
        realtimeStore.clearCountries(id);
      }

      if (batchBuffer.shouldLog() && (stats.domains > 0 || stats.rules > 0)) {
        console.log(
          `[ConntrackCollector:${id}] Active: ${activeConnections.size}, Domains: ${stats.domains}, Rules: ${stats.rules}`,
        );
      }
    } finally {
      isFlushing = false;
    }

    const now = Date.now();
    if (now - lastPruneTime > PRUNE_INTERVAL_MS) {
      lastPruneTime = now;
      realtimeStore.pruneIfNeeded(id);
    }
  };

  flushInterval = setInterval(() => {
    flushBatch();
  }, FLUSH_INTERVAL_MS);

  cleanupInterval = setInterval(() => {
    cleanupStaleConnections();
  }, CLEANUP_INTERVAL);

  const collector = new ConntrackCollector(id, {
    host: ssh.host,
    port: ssh.port,
    username: ssh.username,
    privateKeyPath: ssh.privateKeyPath,
    pollInterval: parseInt(process.env.CONNTRACK_POLL_INTERVAL_MS || "3000"),
    onData: (snapshot) => {
      if (!snapshot.entries || snapshot.entries.length === 0) return;

      // Update device map from the leases data fetched alongside conntrack
      if (snapshot.leasesRaw) {
        const newMap = parseDhcpLeases(snapshot.leasesRaw);
        if (newMap.size > 0) {
          deviceMap.clear();
          for (const [ip, name] of newMap) {
            deviceMap.set(ip, name);
          }
        }
      }

      const now = snapshot.timestamp;
      const geoBatchByIp = new Map<
        string,
        { upload: number; download: number; connections: number }
      >();
      let hasNewTraffic = false;

      for (const entry of snapshot.entries) {
        // Skip internal/local connections (LAN-to-LAN)
        if (isPrivateIP(entry.srcIP) && isPrivateIP(entry.dstIP)) continue;

        // Determine the "external" IP and direction
        // If srcIP is private, the traffic is upload (outbound): dstIP is external
        // If dstIP is private, the traffic is download (inbound): srcIP is external
        let externalIP = "";
        let upload = 0;
        let download = 0;
        let sourceIP = "";

        if (isPrivateIP(entry.srcIP)) {
          // Outbound: src=device, dst=external
          externalIP = entry.dstIP;
          upload = entry.origBytes;
          download = entry.replyBytes;
          sourceIP = entry.srcIP;
        } else if (isPrivateIP(entry.dstIP)) {
          // Inbound: src=external, dst=device
          externalIP = entry.srcIP;
          upload = entry.replyBytes; // reply direction = device→external
          download = entry.origBytes; // orig direction = external→device
          sourceIP = entry.dstIP;
        } else {
          // Both external (shouldn't happen on a home router) — skip
          continue;
        }

        // Skip if no traffic
        if (upload === 0 && download === 0) continue;

        // Build unique connection key
        const connKey = `${entry.proto}:${entry.srcIP}:${entry.srcPort}:${entry.dstIP}:${entry.dstPort}`;

        const existing = activeConnections.get(connKey);
        let deltaUpload = 0;
        let deltaDownload = 0;

        if (!existing) {
          // New connection — don't count initial bytes (baseline)
          activeConnections.set(connKey, {
            key: connKey,
            proto: entry.proto,
            srcIP: entry.srcIP,
            srcPort: entry.srcPort,
            dstIP: entry.dstIP,
            dstPort: entry.dstPort,
            state: entry.state,
            family: entry.family,
            lastOrigBytes: entry.origBytes,
            lastReplyBytes: entry.replyBytes,
            lastSeen: now,
          });

          // For new connections, if there's already significant traffic, count it
          // (the connection existed before we started tracking)
          if (upload > 0 || download > 0) {
            deltaUpload = upload;
            deltaDownload = download;
          }
        } else {
          // Calculate delta
          const origDelta = entry.origBytes - existing.lastOrigBytes;
          const replyDelta = entry.replyBytes - existing.lastReplyBytes;

          // Handle counter reset (connection was recycled): negative delta
          // means the connection was replaced; skip this cycle and re-baseline
          if (origDelta >= 0) {
            if (isPrivateIP(entry.srcIP)) {
              deltaUpload = origDelta;
            } else {
              deltaDownload = origDelta;
            }
          }
          if (replyDelta >= 0) {
            if (isPrivateIP(entry.srcIP)) {
              deltaDownload = replyDelta;
            } else {
              deltaUpload = replyDelta;
            }
          }

          existing.lastOrigBytes = entry.origBytes;
          existing.lastReplyBytes = entry.replyBytes;
          existing.lastSeen = now;
          existing.state = entry.state;
        }

        if (deltaUpload > 0 || deltaDownload > 0) {
          hasNewTraffic = true;

          // Domain: conntrack has no domain info. The dashboard will show
          // the IP address instead.
          const domain = "";

          // Chains/rules: conntrack traffic is "DIRECT" (no proxy)
          const chains = ["DIRECT"];
          const rule = "Direct";
          const rulePayload = "";

          const update: TrafficUpdate = {
            domain,
            ip: externalIP,
            chain: "DIRECT",
            chains,
            rule,
            rulePayload,
            upload: deltaUpload,
            download: deltaDownload,
            connections: 1,
            sourceIP,
            timestampMs: now,
          };

          batchBuffer.add(id, update);

          realtimeStore.recordTraffic(
            id,
            {
              domain,
              ip: externalIP,
              sourceIP,
              chains,
              rule,
              rulePayload,
              upload: deltaUpload,
              download: deltaDownload,
            },
            1,
            now,
          );

          // Aggregate for GeoIP batch
          if (geoService && externalIP) {
            const existingGeo = geoBatchByIp.get(externalIP) || {
              upload: 0,
              download: 0,
              connections: 0,
            };
            existingGeo.upload += deltaUpload;
            existingGeo.download += deltaDownload;
            existingGeo.connections += 1;
            geoBatchByIp.set(externalIP, existingGeo);
          }
        }
      }

      // Process GeoIP batch
      if (hasNewTraffic && geoService) {
        for (const [ip, agg] of geoBatchByIp) {
          geoService
            .getGeoLocation(ip)
            .then((geo: GeoLocation | null) => {
              if (geo) {
                batchBuffer.addGeoResult({
                  ip,
                  geo: {
                    country: geo.country || "",
                    country_name: geo.country_name || geo.country || "",
                    continent: geo.continent || "",
                  },
                  upload: agg.upload,
                  download: agg.download,
                  connections: agg.connections,
                  timestampMs: now,
                });
              }
            })
            .catch(() => {
              // Silently skip GeoIP failures
            });
        }
      }

      // Broadcast
      if (hasNewTraffic) {
        const now2 = Date.now();
        if (now2 - lastBroadcastTime > broadcastThrottleMs) {
          lastBroadcastTime = now2;
          onTrafficUpdate?.();
        }
      }
    },
    onError: (error) => {
      console.error(
        `[ConntrackCollector:${id}] SSH connection error:`,
        error.message,
      );
    },
  });

  return {
    collector,
    start: () => collector.start(),
    stop: () => {
      collector.stop();
      if (flushInterval) clearInterval(flushInterval);
      if (cleanupInterval) clearInterval(cleanupInterval);
    },
    getDeviceMap: () => deviceMap,
  };
}

/**
 * Parse SSH connection info from backend url and token.
 *
 * Accepted url formats:
 *   - "ssh://root@192.168.1.146:22"
 *   - "ssh://192.168.1.146"
 *   - "192.168.1.146:22"
 *   - "192.168.1.146"
 *
 * token (optional): path to SSH private key
 */
function parseSSHUrl(url: string, token?: string): SSHConfig {
  let host = "192.168.1.1";
  let port = 22;
  let username = "root";
  let privateKeyPath = process.env.HOME + "/.ssh/id_ed25519_istoreos";

  // Override key path from token if provided
  if (token && token.startsWith("/")) {
    privateKeyPath = token;
  }

  // Strip ssh:// prefix
  let cleaned = url.replace(/^ssh:\/\//, "");

  // Extract username
  const atIndex = cleaned.indexOf("@");
  if (atIndex > 0) {
    username = cleaned.slice(0, atIndex);
    cleaned = cleaned.slice(atIndex + 1);
  }

  // Extract host and port
  if (cleaned.includes(":")) {
    const [h, p] = cleaned.split(":");
    host = h;
    port = parseInt(p, 10) || 22;
  } else {
    host = cleaned;
  }

  return { host, port, username, privateKeyPath };
}
