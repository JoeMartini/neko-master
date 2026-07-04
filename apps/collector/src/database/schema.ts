/**
 * Database Schema Definition
 * 
 * This file contains all CREATE TABLE statements for the SQLite database.
 * Used for initializing the database schema in a modular way.
 */

export const SCHEMA = {
  // Domain statistics - aggregated by domain per backend
  DOMAIN_STATS: `
    CREATE TABLE IF NOT EXISTS domain_stats (
      backend_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      ips TEXT,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      rules TEXT,
      chains TEXT,
      PRIMARY KEY (backend_id, domain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // IP statistics per backend
  IP_STATS: `
    CREATE TABLE IF NOT EXISTS ip_stats (
      backend_id INTEGER NOT NULL,
      ip TEXT NOT NULL,
      domains TEXT,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      asn TEXT,
      geoip TEXT,
      chains TEXT,
      rules TEXT,
      PRIMARY KEY (backend_id, ip),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Proxy/Chain statistics per backend
  PROXY_STATS: `
    CREATE TABLE IF NOT EXISTS proxy_stats (
      backend_id INTEGER NOT NULL,
      chain TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, chain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Rule statistics per backend
  RULE_STATS: `
    CREATE TABLE IF NOT EXISTS rule_stats (
      backend_id INTEGER NOT NULL,
      rule TEXT NOT NULL,
      final_proxy TEXT,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, rule),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Rule to proxy mapping per backend
  RULE_PROXY_MAP: `
    CREATE TABLE IF NOT EXISTS rule_proxy_map (
      backend_id INTEGER NOT NULL,
      rule TEXT,
      proxy TEXT,
      PRIMARY KEY (backend_id, rule, proxy),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // ASN cache
  ASN_CACHE: `
    CREATE TABLE IF NOT EXISTS asn_cache (
      ip TEXT PRIMARY KEY,
      asn TEXT,
      org TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,

  // GeoIP cache
  GEOIP_CACHE: `
    CREATE TABLE IF NOT EXISTS geoip_cache (
      ip TEXT PRIMARY KEY,
      country TEXT,
      country_name TEXT,
      city TEXT,
      asn TEXT,
      as_name TEXT,
      as_domain TEXT,
      continent TEXT,
      continent_name TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,

  // Country traffic statistics per backend
  COUNTRY_STATS: `
    CREATE TABLE IF NOT EXISTS country_stats (
      backend_id INTEGER NOT NULL,
      country TEXT NOT NULL,
      country_name TEXT,
      continent TEXT,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, country),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Device statistics per backend
  DEVICE_STATS: `
    CREATE TABLE IF NOT EXISTS device_stats (
      backend_id INTEGER NOT NULL,
      source_ip TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, source_ip),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Device×domain traffic aggregation
  DEVICE_DOMAIN_STATS: `
    CREATE TABLE IF NOT EXISTS device_domain_stats (
      backend_id INTEGER NOT NULL,
      source_ip TEXT NOT NULL,
      domain TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, source_ip, domain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Device×IP traffic aggregation
  DEVICE_IP_STATS: `
    CREATE TABLE IF NOT EXISTS device_ip_stats (
      backend_id INTEGER NOT NULL,
      source_ip TEXT NOT NULL,
      ip TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, source_ip, ip),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Hourly aggregation per backend
  HOURLY_STATS: `
    CREATE TABLE IF NOT EXISTS hourly_stats (
      backend_id INTEGER NOT NULL,
      hour TEXT NOT NULL,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      connections INTEGER DEFAULT 0,
      PRIMARY KEY (backend_id, hour),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Connection log per backend
  CONNECTION_LOGS: `
    CREATE TABLE IF NOT EXISTS connection_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backend_id INTEGER NOT NULL,
      domain TEXT,
      ip TEXT,
      chain TEXT,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Minute-level traffic aggregation
  MINUTE_STATS: `
    CREATE TABLE IF NOT EXISTS minute_stats (
      backend_id INTEGER NOT NULL,
      minute TEXT NOT NULL,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      connections INTEGER DEFAULT 0,
      PRIMARY KEY (backend_id, minute),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Minute-level fact table for accurate range queries
  MINUTE_DIM_STATS: `
    CREATE TABLE IF NOT EXISTS minute_dim_stats (
      backend_id INTEGER NOT NULL,
      minute TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      source_ip TEXT NOT NULL DEFAULT '',
      chain TEXT NOT NULL,
      rule TEXT NOT NULL,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      connections INTEGER DEFAULT 0,
      PRIMARY KEY (backend_id, minute, domain, ip, source_ip, chain, rule),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Minute-level country facts for range-based country queries
  MINUTE_COUNTRY_STATS: `
    CREATE TABLE IF NOT EXISTS minute_country_stats (
      backend_id INTEGER NOT NULL,
      minute TEXT NOT NULL,
      country TEXT NOT NULL,
      country_name TEXT,
      continent TEXT,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      connections INTEGER DEFAULT 0,
      PRIMARY KEY (backend_id, minute, country),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Hourly-level fact table for efficient long-range queries (>2h)
  HOURLY_DIM_STATS: `
    CREATE TABLE IF NOT EXISTS hourly_dim_stats (
      backend_id INTEGER NOT NULL,
      hour TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      source_ip TEXT NOT NULL DEFAULT '',
      chain TEXT NOT NULL,
      rule TEXT NOT NULL,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      connections INTEGER DEFAULT 0,
      PRIMARY KEY (backend_id, hour, domain, ip, source_ip, chain, rule),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Hourly-level country facts for efficient long-range queries
  HOURLY_COUNTRY_STATS: `
    CREATE TABLE IF NOT EXISTS hourly_country_stats (
      backend_id INTEGER NOT NULL,
      hour TEXT NOT NULL,
      country TEXT NOT NULL,
      country_name TEXT,
      continent TEXT,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      connections INTEGER DEFAULT 0,
      PRIMARY KEY (backend_id, hour, country),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Domain×proxy traffic aggregation
  DOMAIN_PROXY_STATS: `
    CREATE TABLE IF NOT EXISTS domain_proxy_stats (
      backend_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      chain TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, domain, chain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // IP×proxy traffic aggregation
  IP_PROXY_STATS: `
    CREATE TABLE IF NOT EXISTS ip_proxy_stats (
      backend_id INTEGER NOT NULL,
      ip TEXT NOT NULL,
      chain TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      domains TEXT,
      PRIMARY KEY (backend_id, ip, chain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Rule-specific cross-reference tables
  RULE_CHAIN_TRAFFIC: `
    CREATE TABLE IF NOT EXISTS rule_chain_traffic (
      backend_id INTEGER NOT NULL,
      rule TEXT NOT NULL,
      chain TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, rule, chain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  RULE_DOMAIN_TRAFFIC: `
    CREATE TABLE IF NOT EXISTS rule_domain_traffic (
      backend_id INTEGER NOT NULL,
      rule TEXT NOT NULL,
      domain TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, rule, domain),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  RULE_IP_TRAFFIC: `
    CREATE TABLE IF NOT EXISTS rule_ip_traffic (
      backend_id INTEGER NOT NULL,
      rule TEXT NOT NULL,
      ip TEXT NOT NULL,
      total_upload INTEGER DEFAULT 0,
      total_download INTEGER DEFAULT 0,
      total_connections INTEGER DEFAULT 0,
      last_seen DATETIME,
      PRIMARY KEY (backend_id, rule, ip),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Backend configurations
  BACKEND_CONFIGS: `
    CREATE TABLE IF NOT EXISTS backend_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      token TEXT DEFAULT '',
      type TEXT DEFAULT 'clash',
      enabled BOOLEAN DEFAULT 1,
      is_active BOOLEAN DEFAULT 0,
      listening BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,

  // Agent heartbeat status per backend (for agent:// passive mode)
  AGENT_HEARTBEATS: `
    CREATE TABLE IF NOT EXISTS agent_heartbeats (
      backend_id INTEGER PRIMARY KEY,
      agent_id TEXT NOT NULL,
      hostname TEXT,
      version TEXT,
      gateway_type TEXT,
      gateway_url TEXT,
      remote_ip TEXT,
      gateway_latency_ms INTEGER,
      server_latency_ms INTEGER,
      last_seen DATETIME NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // App configuration
  APP_CONFIG: `
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,

  // Surge policy cache
  SURGE_POLICY_CACHE: `
    CREATE TABLE IF NOT EXISTS surge_policy_cache (
      backend_id INTEGER NOT NULL,
      policy_group TEXT NOT NULL,
      selected_policy TEXT,
      policy_type TEXT DEFAULT 'Select',
      all_policies TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (backend_id, policy_group),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Auth configuration
  AUTH_CONFIG: `
    CREATE TABLE IF NOT EXISTS auth_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,

  // Agent config snapshot - persists agent configuration across restarts
  AGENT_SNAPSHOTS: `
    CREATE TABLE IF NOT EXISTS agent_snapshots (
      backend_id INTEGER PRIMARY KEY,
      config_json TEXT NOT NULL,
      policy_state_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,

  // Backend health check log - one row per minute per backend
  BACKEND_HEALTH_LOGS: `
    CREATE TABLE IF NOT EXISTS backend_health_logs (
      backend_id INTEGER NOT NULL,
      minute TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      server_latency_ms INTEGER,
      message TEXT,
      PRIMARY KEY (backend_id, minute),
      FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
    );
  `,
} as const;

// Index definitions
export const INDEXES = [
  // Device stats indexes
  `CREATE INDEX IF NOT EXISTS idx_device_domain_source_ip ON device_domain_stats(backend_id, source_ip);`,
  `CREATE INDEX IF NOT EXISTS idx_device_ip_source_ip ON device_ip_stats(backend_id, source_ip);`,

  // Domain proxy stats index
  `CREATE INDEX IF NOT EXISTS idx_domain_proxy_chain ON domain_proxy_stats(backend_id, chain);`,

  // IP proxy stats index
  `CREATE INDEX IF NOT EXISTS idx_ip_proxy_chain ON ip_proxy_stats(backend_id, chain);`,

  // Rule traffic indexes
  `CREATE INDEX IF NOT EXISTS idx_rule_chain_traffic ON rule_chain_traffic(backend_id, rule);`,
  `CREATE INDEX IF NOT EXISTS idx_rule_domain_traffic ON rule_domain_traffic(backend_id, rule);`,
  `CREATE INDEX IF NOT EXISTS idx_rule_ip_traffic ON rule_ip_traffic(backend_id, rule);`,

  // Stats indexes.
  // No expression indexes on (total_download + total_upload): every hot query
  // filters by backend_id first, so SQLite never used them for the ORDER BY —
  // they only added write amplification on the four hottest tables.
  `CREATE INDEX IF NOT EXISTS idx_domain_stats_backend ON domain_stats(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ip_stats_backend ON ip_stats(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_proxy_stats_backend ON proxy_stats(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rule_stats_backend ON rule_stats(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rule_proxy_map ON rule_proxy_map(backend_id, rule, proxy);`,
  `CREATE INDEX IF NOT EXISTS idx_country_stats_backend ON country_stats(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_stats_backend ON hourly_stats(backend_id);`,

  // Minute stats indexes
  `CREATE INDEX IF NOT EXISTS idx_minute_stats_backend_minute ON minute_stats(backend_id, minute);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_dim_backend_minute ON minute_dim_stats(backend_id, minute);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_dim_backend_minute_domain ON minute_dim_stats(backend_id, minute, domain);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_dim_backend_minute_ip ON minute_dim_stats(backend_id, minute, ip);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_dim_backend_minute_chain ON minute_dim_stats(backend_id, minute, chain);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_dim_backend_minute_rule ON minute_dim_stats(backend_id, minute, rule);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_dim_backend_minute_source ON minute_dim_stats(backend_id, minute, source_ip);`,
  `CREATE INDEX IF NOT EXISTS idx_minute_country_backend_minute ON minute_country_stats(backend_id, minute);`,

  // Hourly dim stats indexes
  `CREATE INDEX IF NOT EXISTS idx_hourly_dim_backend_hour ON hourly_dim_stats(backend_id, hour);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_dim_backend_hour_domain ON hourly_dim_stats(backend_id, hour, domain);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_dim_backend_hour_ip ON hourly_dim_stats(backend_id, hour, ip);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_dim_backend_hour_chain ON hourly_dim_stats(backend_id, hour, chain);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_dim_backend_hour_rule ON hourly_dim_stats(backend_id, hour, rule);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_dim_backend_hour_source ON hourly_dim_stats(backend_id, hour, source_ip);`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_country_backend_hour ON hourly_country_stats(backend_id, hour);`,

  // Connection logs indexes
  `CREATE INDEX IF NOT EXISTS idx_connection_logs_backend ON connection_logs(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_connection_logs_timestamp ON connection_logs(timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_connection_logs_domain ON connection_logs(domain);`,
  `CREATE INDEX IF NOT EXISTS idx_connection_logs_chain ON connection_logs(chain);`,

  // Backend configs unique index
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_backend_configs_name ON backend_configs(name);`,

  // Agent heartbeat indexes
  `CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_last_seen ON agent_heartbeats(last_seen);`,

  // Backend health log indexes
  `CREATE INDEX IF NOT EXISTS idx_backend_health_logs_backend_minute ON backend_health_logs(backend_id, minute);`,
  `CREATE INDEX IF NOT EXISTS idx_backend_health_logs_minute ON backend_health_logs(minute);`,

  // Surge policy cache indexes
  `CREATE INDEX IF NOT EXISTS idx_surge_policy_backend ON surge_policy_cache(backend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_surge_policy_updated ON surge_policy_cache(updated_at);`,
] as const;

// Default app config values
export const DEFAULT_APP_CONFIG = `
  INSERT OR IGNORE INTO app_config (key, value) VALUES 
    ('retention.connection_logs_days', '7'),
    ('retention.hourly_stats_days', '30'),
    ('retention.auto_cleanup', '1'),
    ('geoip.lookup_provider', 'online'),
    ('geoip.online_api_url', 'https://api.ipinfo.es/ipinfo');
`;

// Default auth config values
export const DEFAULT_AUTH_CONFIG = `
  INSERT OR IGNORE INTO auth_config (key, value) VALUES 
    ('enabled', '0'),
    ('token_hash', '');
`;

// Get all schema creation statements in order
export function getAllSchemaStatements(): string[] {
  return [
    SCHEMA.DOMAIN_STATS,
    SCHEMA.IP_STATS,
    SCHEMA.PROXY_STATS,
    SCHEMA.RULE_STATS,
    SCHEMA.RULE_PROXY_MAP,
    SCHEMA.ASN_CACHE,
    SCHEMA.GEOIP_CACHE,
    SCHEMA.COUNTRY_STATS,
    SCHEMA.DEVICE_STATS,
    SCHEMA.DEVICE_DOMAIN_STATS,
    SCHEMA.DEVICE_IP_STATS,
    SCHEMA.HOURLY_STATS,
    SCHEMA.CONNECTION_LOGS,
    SCHEMA.MINUTE_STATS,
    SCHEMA.MINUTE_DIM_STATS,
    SCHEMA.MINUTE_COUNTRY_STATS,
    SCHEMA.HOURLY_DIM_STATS,
    SCHEMA.HOURLY_COUNTRY_STATS,
    SCHEMA.DOMAIN_PROXY_STATS,
    SCHEMA.IP_PROXY_STATS,
    SCHEMA.RULE_CHAIN_TRAFFIC,
    SCHEMA.RULE_DOMAIN_TRAFFIC,
    SCHEMA.RULE_IP_TRAFFIC,
    SCHEMA.BACKEND_CONFIGS,
    SCHEMA.AGENT_HEARTBEATS,
    SCHEMA.AGENT_SNAPSHOTS,
    SCHEMA.BACKEND_HEALTH_LOGS,
    SCHEMA.APP_CONFIG,
    SCHEMA.SURGE_POLICY_CACHE,
    SCHEMA.AUTH_CONFIG,
    ...INDEXES,
    DEFAULT_APP_CONFIG,
    DEFAULT_AUTH_CONFIG,
  ];
}
