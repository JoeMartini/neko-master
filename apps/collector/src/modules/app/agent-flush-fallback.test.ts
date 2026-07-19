import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { createTestDatabase } from "../../__tests__/helpers.js";
import { realtimeStore } from "../realtime/realtime.store.js";
import type { StatsDatabase } from "../db/db.js";

// Fake ClickHouse writer that is reported enabled+healthy (so the flush path
// skips SQLite writes under CH_ONLY_MODE) but whose traffic write always
// fails. This reproduces the exact condition of the agent CH_ONLY data-loss
// bug: buffer is cleared, SQLite was skipped, and ClickHouse rejects — the
// snapshot must be persisted to SQLite as a durable fallback.
// Hoisted so the vi.mock factory (which is itself hoisted above imports) can
// reference it safely.
const { failingWriter } = vi.hoisted(() => ({
  failingWriter: {
    isEnabled: () => true,
    isHealthy: () => true,
    writeTrafficBatch: () => Promise.reject(new Error("ClickHouse unreachable")),
    writeCountryBatch: () => Promise.resolve(),
  },
}));

vi.mock("../clickhouse/clickhouse.writer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../clickhouse/clickhouse.writer.js")>();
  return {
    ...actual,
    getClickHouseWriter: () => failingWriter,
  };
});

describe("Agent flush ClickHouse-failure fallback (C1)", () => {
  let db: StatsDatabase;
  let cleanup: () => void;
  let backendId: number;
  let app: FastifyInstance;
  const AGENT_TOKEN = "secret-agent-token";
  const originalChOnly = process.env.CH_ONLY_MODE;

  beforeEach(async () => {
    // CH_ONLY_MODE + a "healthy" writer makes flush() skip SQLite writes,
    // setting sqliteSkipped=true — the precondition for the durable fallback.
    process.env.CH_ONLY_MODE = "1";

    ({ db, cleanup } = createTestDatabase());
    backendId = db.createBackend({
      name: "agent-backend",
      url: "agent://test",
      token: AGENT_TOKEN,
      type: "clash",
    });
    db.setActiveBackend(backendId);

    app = await createApp({
      port: 0,
      db,
      realtimeStore,
      logger: false,
      autoListen: false,
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    realtimeStore.clearBackend(backendId);
    cleanup();
    if (originalChOnly === undefined) delete process.env.CH_ONLY_MODE;
    else process.env.CH_ONLY_MODE = originalChOnly;
  });

  it("persists traffic to SQLite when the ClickHouse write fails after SQLite was skipped", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/report",
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: {
        backendId,
        agentId: "test-agent",
        protocolVersion: 1,
        requestId: "req-fallback-1",
        updates: [
          {
            domain: "example.com",
            ip: "1.2.3.4",
            chains: ["ProxyA", "RuleA"],
            rule: "DOMAIN-SUFFIX",
            rulePayload: "example.com",
            upload: 1000,
            download: 2000,
            connections: 1,
            sourceIP: "192.168.1.10",
            timestampMs: Date.now(),
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, accepted: 1 });

    // Sanity: SQLite was skipped on ingest, so nothing is persisted yet.
    expect(db.getDomainStats(backendId, 10).length).toBe(0);

    // Closing the app runs the onClose hook, which flushes pending agent
    // buffers. The ClickHouse write fails, so the fallback must write to SQLite.
    await app.close();
    app = undefined as unknown as FastifyInstance;

    const domains = db.getDomainStats(backendId, 10);
    expect(domains.length).toBe(1);
    expect(domains[0].domain).toBe("example.com");
    expect(domains[0].totalUpload).toBe(1000);
    expect(domains[0].totalDownload).toBe(2000);

    // The realtime store must be retained for the UI (not cleared) since the
    // fallback path re-marks the write as OK, which clears it — verify data is
    // durably in SQLite regardless.
    const ips = db.getIPStats(backendId, 10);
    expect(ips.some((r) => r.ip === "1.2.3.4")).toBe(true);
  });
});
