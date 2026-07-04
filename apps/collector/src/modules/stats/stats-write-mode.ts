let warnedMissingWriter = false;
let warnedEnabled = false;
let warnedSqliteReads = false;

export function isClickHouseOnlyModeEnabled(): boolean {
  return process.env.CH_ONLY_MODE === '1';
}

export function shouldSkipSqliteStatsWrites(clickHouseWriterEnabled: boolean): boolean {
  if (!isClickHouseOnlyModeEnabled()) {
    return false;
  }

  if (!clickHouseWriterEnabled) {
    if (!warnedMissingWriter) {
      warnedMissingWriter = true;
      console.warn(
        '[Stats Write Mode] CH_ONLY_MODE=1 but CH writer is disabled; keep SQLite writes to avoid data loss',
      );
    }
    return false;
  }

  if (!warnedEnabled) {
    warnedEnabled = true;
    console.info(
      '[Stats Write Mode] CH_ONLY_MODE=1 enabled; skip SQLite traffic/country stats writes',
    );
  }

  return true;
}

/**
 * Reduced SQLite writes (skipping domain/IP/rule/dim tables) are only safe
 * when reads actually prefer ClickHouse — otherwise the default SQLite read
 * path silently serves data with those tables missing.
 */
export function shouldReduceSqliteWrites(clickHouseWriterHealthy: boolean): boolean {
  if (!clickHouseWriterHealthy) return false;
  if (process.env.CH_DISABLE_SQLITE_REDUCTION === '1') return false;

  const source = String(process.env.STATS_QUERY_SOURCE || 'sqlite').trim().toLowerCase();
  const readsPreferClickHouse =
    source === 'clickhouse' || source === 'clickhous' || source === 'auto' || isClickHouseOnlyModeEnabled();

  if (!readsPreferClickHouse) {
    if (!warnedSqliteReads) {
      warnedSqliteReads = true;
      console.warn(
        '[Stats Write Mode] ClickHouse writes are enabled but STATS_QUERY_SOURCE=sqlite; keeping full SQLite writes so reads stay complete. Set STATS_QUERY_SOURCE=clickhouse (or auto) to enable reduced SQLite writes.',
      );
    }
    return false;
  }

  return true;
}
