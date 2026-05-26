import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

export const jobsEnqueuedTotal = new Counter({
  name: 'mariaboss_jobs_enqueued_total',
  help: 'Total jobs enqueued',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const jobsCompletedTotal = new Counter({
  name: 'mariaboss_jobs_completed_total',
  help: 'Total jobs completed',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const jobsFailedTotal = new Counter({
  name: 'mariaboss_jobs_failed_total',
  help: 'Total jobs failed',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const jobsStalledTotal = new Counter({
  name: 'mariaboss_jobs_stalled_total',
  help: 'Total jobs recovered from stalled state',
  registers: [register],
});

export const jobsPoisonedTotal = new Counter({
  name: 'mariaboss_jobs_poisoned_total',
  help: 'Jobs moved to dead letter queue',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const claimLatencyMs = new Histogram({
  name: 'mariaboss_claim_latency_ms',
  help: 'Job claim latency in milliseconds',
  labelNames: ['queue'] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [register],
});

export const activeJobsGauge = new Gauge({
  name: 'mariaboss_active_jobs',
  help: 'Currently active jobs',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const dlqSizeGauge = new Gauge({
  name: 'mariaboss_dlq_size',
  help: 'Dead letter queue size',
  labelNames: ['queue'] as const,
  registers: [register],
});

export function getMetricsRegistry(): Registry {
  return register;
}

export async function getMetricsText(): Promise<string> {
  return register.metrics();
}
