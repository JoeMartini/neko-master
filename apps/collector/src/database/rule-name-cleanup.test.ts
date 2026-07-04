import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { getAllSchemaStatements } from './schema.js';
import { cleanupMisattributedRuleNames } from './rule-name-cleanup.js';

const BACKEND_ID = 1;
const GROUP_CHAIN = '香港 01 > 🔯 大流量节点';

function createRawDb(): Database.Database {
  const db = new Database(':memory:');
  for (const stmt of getAllSchemaStatements()) {
    db.exec(stmt);
  }
  db.prepare(`
    INSERT INTO backend_configs (name, url, token, enabled, is_active, listening)
    VALUES ('test', 'http://127.0.0.1:9090', '', 1, 1, 1)
  `).run();
  return db;
}

function seedChainRow(db: Database.Database, rule: string, chain: string, up: number, down: number, conn: number) {
  db.prepare(`
    INSERT INTO rule_chain_traffic (backend_id, rule, chain, total_upload, total_download, total_connections, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, '2026-06-01T00:00:00.000Z')
  `).run(BACKEND_ID, rule, chain, up, down, conn);
}

describe('cleanupMisattributedRuleNames', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createRawDb();
  });

  it('remaps rule-type keys on multi-hop chains back to the policy group and merges totals', () => {
    // Polluted row written by v1.3.9 naming + pre-existing correct row
    seedChainRow(db, 'RuleSet(OpenAI)', GROUP_CHAIN, 100, 200, 3);
    seedChainRow(db, '🔯 大流量节点', GROUP_CHAIN, 10, 20, 1);

    db.prepare(`
      INSERT INTO rule_stats (backend_id, rule, final_proxy, total_upload, total_download, total_connections, last_seen)
      VALUES (?, 'RuleSet(OpenAI)', '香港 01', 100, 200, 3, '2026-06-01T00:00:00.000Z'),
             (?, '🔯 大流量节点', '香港 01', 10, 20, 1, '2026-05-01T00:00:00.000Z')
    `).run(BACKEND_ID, BACKEND_ID);

    db.prepare(`
      INSERT INTO rule_domain_traffic (backend_id, rule, domain, total_upload, total_download, total_connections, last_seen)
      VALUES (?, 'RuleSet(OpenAI)', 'media.example', 100, 200, 3, '2026-06-01T00:00:00.000Z')
    `).run(BACKEND_ID);
    db.prepare(`
      INSERT INTO rule_ip_traffic (backend_id, rule, ip, total_upload, total_download, total_connections, last_seen)
      VALUES (?, 'RuleSet(OpenAI)', '8.8.8.8', 100, 200, 3, '2026-06-01T00:00:00.000Z')
    `).run(BACKEND_ID);
    db.prepare(`
      INSERT INTO rule_proxy_map (backend_id, rule, proxy)
      VALUES (?, 'RuleSet(OpenAI)', '香港 01'), (?, '🔯 大流量节点', '香港 01')
    `).run(BACKEND_ID, BACKEND_ID);
    db.prepare(`
      INSERT INTO minute_dim_stats (backend_id, minute, domain, ip, source_ip, chain, rule, upload, download, connections)
      VALUES (?, '2026-06-01T00:00:00', 'media.example', '8.8.8.8', '192.168.1.8', ?, 'RuleSet(OpenAI)', 100, 200, 3)
    `).run(BACKEND_ID, GROUP_CHAIN);
    db.prepare(`
      INSERT INTO hourly_dim_stats (backend_id, hour, domain, ip, source_ip, chain, rule, upload, download, connections)
      VALUES (?, '2026-06-01T00:00:00', 'media.example', '8.8.8.8', '192.168.1.8', ?, 'RuleSet(OpenAI)', 100, 200, 3)
    `).run(BACKEND_ID, GROUP_CHAIN);

    cleanupMisattributedRuleNames(db);

    const chainRows = db.prepare(`SELECT rule, total_upload as up, total_download as down, total_connections as conn FROM rule_chain_traffic`).all() as Array<{ rule: string; up: number; down: number; conn: number }>;
    expect(chainRows).toHaveLength(1);
    expect(chainRows[0]).toEqual({ rule: '🔯 大流量节点', up: 110, down: 220, conn: 4 });

    const ruleRows = db.prepare(`SELECT rule, final_proxy as fp, total_upload as up, total_download as down FROM rule_stats`).all() as Array<{ rule: string; fp: string; up: number; down: number }>;
    expect(ruleRows).toHaveLength(1);
    expect(ruleRows[0]).toEqual({ rule: '🔯 大流量节点', fp: '香港 01', up: 110, down: 220 });

    const domainRows = db.prepare(`SELECT rule FROM rule_domain_traffic`).all() as Array<{ rule: string }>;
    expect(domainRows).toEqual([{ rule: '🔯 大流量节点' }]);
    const ipRows = db.prepare(`SELECT rule FROM rule_ip_traffic`).all() as Array<{ rule: string }>;
    expect(ipRows).toEqual([{ rule: '🔯 大流量节点' }]);

    const proxyMap = db.prepare(`SELECT rule, proxy FROM rule_proxy_map`).all() as Array<{ rule: string; proxy: string }>;
    expect(proxyMap).toEqual([{ rule: '🔯 大流量节点', proxy: '香港 01' }]);

    for (const table of ['minute_dim_stats', 'hourly_dim_stats']) {
      const dimRules = db.prepare(`SELECT DISTINCT rule FROM ${table}`).all() as Array<{ rule: string }>;
      expect(dimRules).toEqual([{ rule: '🔯 大流量节点' }]);
    }

    const flag = db.prepare(`SELECT value FROM app_config WHERE key = 'rule_name_cleanup_v1'`).get() as { value: string } | undefined;
    expect(flag?.value).toBe('1');
  });

  it('leaves single-hop rows (DIRECT-target rule details) and Surge-style rows untouched', () => {
    seedChainRow(db, 'RuleSet(ChinaDomain)', 'DIRECT', 10, 20, 1);
    seedChainRow(db, 'YouTube|Media', 'JP-Sakura > Manual|Select > YouTube|Media', 5, 5, 1);

    cleanupMisattributedRuleNames(db);

    const rules = (db.prepare(`SELECT rule FROM rule_chain_traffic ORDER BY rule`).all() as Array<{ rule: string }>).map(r => r.rule);
    expect(rules).toEqual(['RuleSet(ChinaDomain)', 'YouTube|Media']);
  });

  it('is idempotent: second run is a no-op even if polluted-looking rows reappear', () => {
    seedChainRow(db, 'RuleSet(OpenAI)', GROUP_CHAIN, 100, 200, 3);
    cleanupMisattributedRuleNames(db);
    seedChainRow(db, 'RuleSet(Telegram)', GROUP_CHAIN, 1, 1, 1);
    cleanupMisattributedRuleNames(db);

    const rules = (db.prepare(`SELECT rule FROM rule_chain_traffic ORDER BY rule`).all() as Array<{ rule: string }>).map(r => r.rule);
    expect(rules).toEqual(['RuleSet(Telegram)', '🔯 大流量节点']);
  });

  it('assigns rule-only tables to the dominant policy group when a name maps to several', () => {
    seedChainRow(db, 'Match', '香港 01 > 兜底组', 1000, 2000, 5);
    seedChainRow(db, 'Match', '美国 01 > 其他组', 1, 2, 1);
    db.prepare(`
      INSERT INTO rule_stats (backend_id, rule, final_proxy, total_upload, total_download, total_connections, last_seen)
      VALUES (?, 'Match', '香港 01', 1001, 2002, 6, '2026-06-01T00:00:00.000Z')
    `).run(BACKEND_ID);

    cleanupMisattributedRuleNames(db);

    const chainRules = (db.prepare(`SELECT rule FROM rule_chain_traffic`).all() as Array<{ rule: string }>).map(r => r.rule);
    expect(new Set(chainRules)).toEqual(new Set(['其他组', '兜底组']));

    const ruleRows = db.prepare(`SELECT rule FROM rule_stats`).all() as Array<{ rule: string }>;
    expect(ruleRows).toEqual([{ rule: '兜底组' }]);
  });
});
