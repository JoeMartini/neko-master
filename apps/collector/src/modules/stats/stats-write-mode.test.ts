import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('stats-write-mode', () => {
  const prevMode = process.env.CH_ONLY_MODE;
  const prevSource = process.env.STATS_QUERY_SOURCE;
  const prevReduction = process.env.CH_DISABLE_SQLITE_REDUCTION;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.CH_ONLY_MODE;
    delete process.env.STATS_QUERY_SOURCE;
    delete process.env.CH_DISABLE_SQLITE_REDUCTION;
  });

  afterEach(() => {
    if (prevMode === undefined) {
      delete process.env.CH_ONLY_MODE;
    } else {
      process.env.CH_ONLY_MODE = prevMode;
    }
    if (prevSource === undefined) {
      delete process.env.STATS_QUERY_SOURCE;
    } else {
      process.env.STATS_QUERY_SOURCE = prevSource;
    }
    if (prevReduction === undefined) {
      delete process.env.CH_DISABLE_SQLITE_REDUCTION;
    } else {
      process.env.CH_DISABLE_SQLITE_REDUCTION = prevReduction;
    }
    vi.restoreAllMocks();
  });

  it('should keep sqlite writes when CH_ONLY_MODE is disabled', async () => {
    const mode = await import('./stats-write-mode.js');
    expect(mode.shouldSkipSqliteStatsWrites(true)).toBe(false);
    expect(mode.shouldSkipSqliteStatsWrites(false)).toBe(false);
  });

  it('should keep sqlite writes and warn when writer is unhealthy', async () => {
    process.env.CH_ONLY_MODE = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldSkipSqliteStatsWrites(false)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('should skip sqlite writes when writer is healthy', async () => {
    process.env.CH_ONLY_MODE = '1';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldSkipSqliteStatsWrites(true)).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('should not reduce sqlite writes when reads stay on sqlite (default)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldReduceSqliteWrites(true)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    // warning is one-shot
    expect(mode.shouldReduceSqliteWrites(true)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('should reduce sqlite writes when reads prefer clickhouse and writer is healthy', async () => {
    process.env.STATS_QUERY_SOURCE = 'clickhouse';
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldReduceSqliteWrites(true)).toBe(true);
    expect(mode.shouldReduceSqliteWrites(false)).toBe(false);
  });

  it('should reduce sqlite writes in auto mode and CH_ONLY_MODE', async () => {
    process.env.STATS_QUERY_SOURCE = 'auto';
    let mode = await import('./stats-write-mode.js');
    expect(mode.shouldReduceSqliteWrites(true)).toBe(true);

    vi.resetModules();
    delete process.env.STATS_QUERY_SOURCE;
    process.env.CH_ONLY_MODE = '1';
    mode = await import('./stats-write-mode.js');
    expect(mode.shouldReduceSqliteWrites(true)).toBe(true);
  });

  it('should honor CH_DISABLE_SQLITE_REDUCTION as a hard off switch', async () => {
    process.env.STATS_QUERY_SOURCE = 'clickhouse';
    process.env.CH_DISABLE_SQLITE_REDUCTION = '1';
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldReduceSqliteWrites(true)).toBe(false);
  });
});
