import type { JobData } from './job.js';
import type { DefaultJobOptions } from './job.js';
import type { MariaBossConnectionOptions } from './connection.js';

export interface WorkerContext {
  signal: AbortSignal;
  leaseToken: string;
  extendLock(durationMs?: number): Promise<boolean>;
}

export type JobProcessor<T = unknown> = (job: JobData<T>, ctx: WorkerContext) => Promise<void>;

export interface WorkerOptions {
  connection?: MariaBossConnectionOptions;
  concurrency?: number;
  lockDuration?: number;
  stalledInterval?: number;
  maxStalledCount?: number;
  pollInterval?: number;
  maxPollInterval?: number;
  batchSize?: number;
  workerId?: string;
  heartbeatInterval?: number;
  defaultJobOptions?: DefaultJobOptions;
}

export interface QueueOptions {
  connection?: MariaBossConnectionOptions;
  defaultJobOptions?: DefaultJobOptions;
  prefix?: string;
}
