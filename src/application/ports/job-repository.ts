import type { PoolConnection } from 'mysql2/promise';
import type { AddJobOptions, DefaultJobOptions, JobRow } from '../../types/job.js';
import type { BackoffConfig } from '../../retry/backoff.js';

export interface EnqueueInput {
  queueName: string;
  jobName: string;
  payload: unknown;
  options?: AddJobOptions & DefaultJobOptions;
}

export interface ClaimOptions {
  queueName: string;
  batchSize: number;
  leaseOwner: string;
  lockDurationMs: number;
}

export interface IJobRepository {
  enqueue(input: EnqueueInput, connection?: PoolConnection): Promise<number>;
  claim(options: ClaimOptions): Promise<JobRow[]>;
  complete(jobId: number, leaseToken: string): Promise<boolean>;
  fail(
    jobId: number,
    leaseToken: string,
    error: string,
    backoff: BackoffConfig,
    moveToDlq: boolean,
  ): Promise<boolean>;
  extendLease(jobId: number, leaseToken: string, lockDurationMs: number): Promise<boolean>;
  recoverStalled(maxStalledCount: number): Promise<number>;
  cancel(jobId: number): Promise<boolean>;
  cancelByIdempotencyKey(queueName: string, key: string): Promise<boolean>;
  getJob(jobId: number): Promise<JobRow | null>;
  cleanupCompleted(olderThanMs: number, limit: number): Promise<number>;
  countByState(queueName: string): Promise<Record<string, number>>;
}
