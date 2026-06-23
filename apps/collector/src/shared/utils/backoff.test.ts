import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay } from './backoff.js';

describe('calculateBackoffDelay', () => {
  it('grows exponentially and caps at maxDelay (no jitter)', () => {
    expect(calculateBackoffDelay(0, 1000, 60000, false)).toBe(1000);
    expect(calculateBackoffDelay(1, 1000, 60000, false)).toBe(2000);
    expect(calculateBackoffDelay(2, 1000, 60000, false)).toBe(4000);
    // 1000 * 2^10 = 1024000, capped at 60000
    expect(calculateBackoffDelay(10, 1000, 60000, false)).toBe(60000);
  });

  it('with jitter stays within [capped/2, capped]', () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const capped = Math.min(1000 * 2 ** attempt, 60000);
      for (let i = 0; i < 200; i++) {
        const delay = calculateBackoffDelay(attempt, 1000, 60000);
        expect(delay).toBeGreaterThanOrEqual(Math.floor(capped / 2));
        expect(delay).toBeLessThanOrEqual(capped);
      }
    }
  });

  it('jitter produces varied delays (not lockstep)', () => {
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(calculateBackoffDelay(3, 1000, 60000));
    }
    // With jitter over a 4000ms window, repeated calls must not all be equal.
    expect(values.size).toBeGreaterThan(1);
  });
});
