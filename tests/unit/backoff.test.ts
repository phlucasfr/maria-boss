import { describe, it, expect } from 'vitest';
import { computeBackoffDelay, nextRunAt, toBackoffConfig } from '../../src/retry/backoff.js';

describe('backoff', () => {
  it('fixed delay without jitter is stable', () => {
    const d = computeBackoffDelay(2, { type: 'fixed', delay: 1000 }, false);
    expect(d).toBe(1000);
  });

  it('exponential grows with attempt', () => {
    const d1 = computeBackoffDelay(1, { type: 'exponential', delay: 100 }, false);
    const d2 = computeBackoffDelay(3, { type: 'exponential', delay: 100 }, false);
    expect(d2).toBeGreaterThan(d1);
  });

  it('caps at maxDelay', () => {
    const d = computeBackoffDelay(100, { type: 'exponential', delay: 1000, maxDelay: 5000 }, false);
    expect(d).toBe(5000);
  });

  it('nextRunAt is in the future', () => {
    const t = nextRunAt(1, toBackoffConfig({ type: 'fixed', delay: 5000 }));
    expect(t.getTime()).toBeGreaterThan(Date.now());
  });
});
