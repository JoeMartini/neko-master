/**
 * 指数退避计算器（带抖动）
 *
 * Adds "equal jitter" by default so that many collectors failing at the same
 * time (e.g. a shared upstream outage) do not retry in lockstep and create a
 * thundering-herd against the recovering backend. The returned delay is in
 * `[capped/2, capped]` where `capped = min(baseDelay * 2^attempt, maxDelay)`.
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter = true,
): number {
  const capped = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  if (!jitter) {
    return capped;
  }
  const half = capped / 2;
  return Math.round(half + Math.random() * half);
}
