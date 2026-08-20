# Conntrack Collector

Conntrack collector enables traffic analysis for routers that don't run Clash/Mihomo — it reads the kernel's conntrack table via SSH.

## How It Works

```
iStoreOS / OpenWrt router
  /proc/net/nf_conntrack  ←── SSH poll (3s default)
  /tmp/dhcp.leases        ←── SSH poll (piggybacked)
         │
         ▼
  neko-master collector
    ├── Delta calculation (bytes per connection between polls)
    ├── Device name mapping (IP → hostname from DHCP leases)
    ├── GeoIP lookup (IP → country/ASN)
    └── BatchBuffer → SQLite / ClickHouse
         │
         ▼
  neko-master dashboard
    (IP stats, device stats, country stats, trends)
```

## What It Captures

- ✅ Per-IP traffic (upload/download/connections)
- ✅ Per-device traffic (source IP from DHCP leases)
- ✅ Country/region distribution (via GeoIP)
- ✅ Time-series trends (minute/hourly/daily)
- ❌ Domain names (conntrack has IPs only, no DNS query info)
- ❌ Proxy node / rule chain (conntrack traffic is "DIRECT")

## Setup

### 1. Prerequisites

- SSH key-based access to your router (`ssh -i ~/.ssh/your_key root@router_ip`)
- The router must expose `/proc/net/nf_conntrack` (standard on Linux/OpenWrt)
- Router must have `/tmp/dhcp.leases` (standard on OpenWrt/dnsmasq)

### 2. Docker Compose

```yaml
# docker-compose.conntrack.yml
services:
  neko-master:
    image: neko-master-conntrack:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "3002:3002"
    volumes:
      - ./data:/app/data
      - ~/.ssh/id_ed25519_istoreos:/root/.ssh/id_ed25519_istoreos:ro
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
      - COOKIE_SECRET=${COOKIE_SECRET}
      - CONNTRACK_POLL_INTERVAL_MS=3000
```

```bash
# Generate cookie secret
echo "COOKIE_SECRET=$(openssl rand -hex 32)" > .env

# Start
docker compose -f docker-compose.conntrack.yml up -d
```

### 3. Configure Backend

Open the dashboard at `http://localhost:3000`, go to **Settings → Backends → Add Backend**:

| Field | Value |
|-------|-------|
| Name | iStoreOS (or any name) |
| Type | **Conntrack (SSH)** |
| URL | `ssh://root@192.168.1.146:22` |
| Token | Path to SSH private key (e.g. `/root/.ssh/id_ed25519_istoreos`) |

The `Token` field is repurposed as the SSH private key path inside the container.

### 4. Combined with Clash Backend

You can add multiple backends simultaneously:

1. **Clash backend** — for proxied traffic (has domains, proxy nodes, rules)
2. **Conntrack backend** — for all router NAT traffic (IP-level, device-level)

Both backends' data appears in the same dashboard, isolated by `backend_id`.

## Non-Intrusive Design

The collector **only reads** two files via SSH:

- `/proc/net/nf_conntrack` — kernel connection tracking table
- `/tmp/dhcp.leases` — dnsmasq DHCP lease file

It does NOT:
- Modify any router configuration
- Install any agent on the router
- Enable dnsmasq query logging
- Change firewall rules

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `CONNTRACK_POLL_INTERVAL_MS` | `3000` | SSH polling interval |
| `FLUSH_INTERVAL_MS` | `30000` | Batch write interval |
| `DEBUG_CONNTRACK` | `false` | Enable debug logging |

## URL Format

| Input | Parsed As |
|-------|-----------|
| `ssh://root@192.168.1.146:22` | user=root, host=192.168.1.146, port=22 |
| `ssh://192.168.1.146` | user=root (default), host=192.168.1.146, port=22 (default) |
| `192.168.1.146:2222` | user=root, host=192.168.1.146, port=2222 |
| `192.168.1.146` | user=root, host=192.168.1.146, port=22 |
