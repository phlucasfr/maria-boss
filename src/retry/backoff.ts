import type { BackoffOptions } from '../types/job.js';

export interface BackoffConfig {
  type: 'fixed' | 'exponential';
  delay: number;
  maxDelay?: number;
}

const DEFAULT_MAX_DELAY = 86_400_000;

export function computeBackoffDelay(attempt: number, config: BackoffConfig, jitter = true): number {
  let delay: number;
  if (config.type === 'fixed') {
    delay = config.delay;
  } else {
    delay = config.delay * Math.pow(2, Math.max(0, attempt - 1));
  }
  const maxDelay = config.maxDelay ?? DEFAULT_MAX_DELAY;
  delay = Math.min(delay, maxDelay);
  if (jitter) {
    delay = Math.floor(delay * (0.5 + Math.random() * 0.5));
  }
  return delay;
}

export function toBackoffConfig(opts?: BackoffOptions): BackoffConfig {
  return {
    type: opts?.type ?? 'exponential',
    delay: opts?.delay ?? 1000,
  };
}

export function nextRunAt(attempt: number, backoff: BackoffConfig): Date {
  const ms = computeBackoffDelay(attempt, backoff);
  return new Date(Date.now() + ms);
}
