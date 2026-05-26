import type { JobData, JobRow } from '../../types/job.js';
import { parsePayload } from '../../utils/serialize.js';

export function rowToJob<T>(row: JobRow): JobData<T> {
  return {
    id: row.id,
    queueName: row.queue_name,
    name: row.job_name,
    data: parsePayload<T>(row.payload),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    priority: row.priority,
    state: row.state,
    runAt: row.run_at,
    leaseToken: row.lease_token,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    timeoutMs: row.timeout_ms,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}
