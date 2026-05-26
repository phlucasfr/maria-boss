import type { PoolConnection } from 'mysql2/promise';

export type JobState = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled' | 'delayed';

export interface JobData<T = unknown> {
  id: number;
  queueName: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  priority: number;
  state: JobState;
  runAt: Date;
  leaseToken: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  timeoutMs: number | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface BackoffOptions {
  type: 'fixed' | 'exponential';
  delay: number;
}

export interface DefaultJobOptions {
  attempts?: number;
  backoff?: BackoffOptions;
  priority?: number;
  timeout?: number;
  removeOnComplete?: boolean;
}

export interface AddJobOptions extends DefaultJobOptions {
  delay?: number;
  jobId?: string;
  priority?: number;
  connection?: PoolConnection;
}

export interface JobRow {
  id: number;
  queue_name: string;
  job_name: string;
  payload: string | unknown;
  state: JobState;
  priority: number;
  attempts: number;
  max_attempts: number;
  stalled_count: number;
  run_at: Date;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  heartbeat_at: Date | null;
  timeout_ms: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  idempotency_key: string | null;
  trace_context: string | unknown | null;
  last_error: string | null;
  remove_on_complete: number;
  created_at: Date;
  updated_at: Date;
}
