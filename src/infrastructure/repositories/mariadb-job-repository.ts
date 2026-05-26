import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  IJobRepository,
  ClaimOptions,
  EnqueueInput,
} from '../../application/ports/job-repository.js';
import type { JobRow } from '../../types/job.js';
import { DuplicateJobError } from '../../domain/errors/index.js';
import { serializePayload } from '../../utils/serialize.js';
import { generateLeaseToken } from '../../utils/uuid.js';
import { nextRunAt, type BackoffConfig } from '../../retry/backoff.js';
import {
  assertValidQueueName,
  assertValidJobName,
  assertValidIdempotencyKey,
  clampInteger,
  sanitizeErrorMessage,
  MAX_ATTEMPTS,
  MAX_PRIORITY,
  MIN_PRIORITY,
  MAX_DELAY_MS,
  MAX_TIMEOUT_MS,
  MAX_BATCH_SIZE,
  MAX_LOCK_DURATION_MS,
  assertValidLeaseToken,
} from '../../utils/validation.js';

function mapRow(row: RowDataPacket): JobRow {
  return row as unknown as JobRow;
}

export class MariaDbJobRepository implements IJobRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: EnqueueInput, connection?: PoolConnection): Promise<number> {
    assertValidQueueName(input.queueName);
    assertValidJobName(input.jobName);
    const opts = input.options ?? {};
    if (opts.jobId) assertValidIdempotencyKey(opts.jobId);
    const payload = serializePayload(input.payload);
    const delay = opts.delay ? clampInteger(opts.delay, 0, MAX_DELAY_MS, 'delay') : undefined;
    const runAt = delay ? new Date(Date.now() + delay) : new Date();
    const state = delay ? 'delayed' : 'pending';
    const priority = clampInteger(opts.priority ?? 0, MIN_PRIORITY, MAX_PRIORITY, 'priority');
    const maxAttempts = clampInteger(opts.attempts ?? 3, 1, MAX_ATTEMPTS, 'attempts');
    const timeout =
      opts.timeout !== undefined ? clampInteger(opts.timeout, 1, MAX_TIMEOUT_MS, 'timeout') : null;
    const sql = `
      INSERT INTO mariaboss_jobs (
        queue_name, job_name, payload, state, priority, max_attempts,
        run_at, idempotency_key, timeout_ms, remove_on_complete, trace_context
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      input.queueName,
      input.jobName,
      payload,
      state,
      priority,
      maxAttempts,
      runAt,
      opts.jobId ?? null,
      timeout,
      opts.removeOnComplete ? 1 : 0,
      null,
    ];
    const conn = connection ?? this.pool;
    try {
      const [result] = await conn.execute<ResultSetHeader>(sql, params);
      return result.insertId;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'ER_DUP_ENTRY' && opts.jobId) {
        throw new DuplicateJobError();
      }
      throw err;
    }
  }

  async claim(options: ClaimOptions): Promise<JobRow[]> {
    assertValidQueueName(options.queueName);
    const batchSize = clampInteger(options.batchSize, 1, MAX_BATCH_SIZE, 'batchSize');
    const lockDurationMs = clampInteger(
      options.lockDurationMs,
      1000,
      MAX_LOCK_DURATION_MS,
      'lockDurationMs',
    );
    if (options.leaseOwner.length > 128) {
      throw new Error('leaseOwner exceeds 128 characters');
    }
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute<RowDataPacket[]>(
        `
        SELECT id, queue_name, job_name, payload, state, priority, attempts,
               max_attempts, stalled_count, run_at, lease_owner, lease_token,
               lease_expires_at, heartbeat_at, timeout_ms, started_at,
               finished_at, idempotency_key, trace_context, last_error,
               remove_on_complete, created_at, updated_at
        FROM mariaboss_jobs
        WHERE queue_name = ?
          AND state IN ('pending', 'delayed')
          AND run_at <= UTC_TIMESTAMP(6)
        ORDER BY priority DESC, run_at ASC, id ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
        `,
        [options.queueName, batchSize],
      );

      if (rows.length === 0) {
        await conn.commit();
        return [];
      }

      const ids = rows.map((r) => r.id as number);
      const leaseToken = generateLeaseToken();
      const lockSec = Math.ceil(lockDurationMs / 1000);

      const placeholders = ids.map(() => '?').join(',');
      await conn.execute(
        `
        UPDATE mariaboss_jobs
        SET state = 'active',
            lease_owner = ?,
            lease_token = ?,
            lease_expires_at = UTC_TIMESTAMP(6) + INTERVAL ? SECOND,
            started_at = COALESCE(started_at, UTC_TIMESTAMP(6)),
            attempts = attempts + 1,
            heartbeat_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE id IN (${placeholders})
        `,
        [options.leaseOwner, leaseToken, lockSec, ...ids],
      );

      await conn.commit();

      return rows.map((r) => ({
        ...mapRow(r),
        lease_token: leaseToken,
        lease_owner: options.leaseOwner,
        state: 'active' as const,
      }));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async complete(jobId: number, leaseToken: string): Promise<boolean> {
    if (!Number.isInteger(jobId) || jobId < 1) return false;
    assertValidLeaseToken(leaseToken);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      UPDATE mariaboss_jobs
      SET state = 'completed',
          finished_at = UTC_TIMESTAMP(6),
          lease_token = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = UTC_TIMESTAMP(6)
      WHERE id = ? AND lease_token = ? AND state = 'active'
      `,
      [jobId, leaseToken],
    );
    if (result.affectedRows > 0) {
      const [row] = await this.pool.execute<RowDataPacket[]>(
        'SELECT remove_on_complete FROM mariaboss_jobs WHERE id = ?',
        [jobId],
      );
      if (row[0]?.remove_on_complete === 1) {
        await this.pool.execute('DELETE FROM mariaboss_jobs WHERE id = ?', [jobId]);
      }
    }
    return result.affectedRows > 0;
  }

  async fail(
    jobId: number,
    leaseToken: string,
    error: string,
    backoff: BackoffConfig,
    moveToDlq: boolean,
  ): Promise<boolean> {
    if (!Number.isInteger(jobId) || jobId < 1) return false;
    assertValidLeaseToken(leaseToken);
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `
      SELECT id, queue_name, job_name, payload, attempts, max_attempts, stalled_count
      FROM mariaboss_jobs
      WHERE id = ? AND lease_token = ? AND state = 'active'
      `,
      [jobId, leaseToken],
    );
    if (rows.length === 0) return false;

    const job = mapRow(rows[0]!);
    const attempts = job.attempts;
    const maxAttempts = job.max_attempts;

    if (attempts >= maxAttempts || moveToDlq) {
      await this.moveToDeadLetter(job, error);
      await this.pool.execute(
        `UPDATE mariaboss_jobs SET state = 'failed', last_error = ?, finished_at = UTC_TIMESTAMP(6),
         lease_token = NULL, lease_owner = NULL WHERE id = ?`,
        [sanitizeErrorMessage(error).slice(0, 65535), jobId],
      );
      return true;
    }

    const runAt = nextRunAt(attempts, backoff);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      UPDATE mariaboss_jobs
      SET state = 'pending',
          run_at = ?,
          last_error = ?,
          lease_token = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = UTC_TIMESTAMP(6)
      WHERE id = ? AND lease_token = ? AND state = 'active'
      `,
      [runAt, sanitizeErrorMessage(error).slice(0, 65535), jobId, leaseToken],
    );
    return result.affectedRows > 0;
  }

  private async moveToDeadLetter(job: JobRow, error: string): Promise<void> {
    await this.pool.execute(
      `
      INSERT INTO mariaboss_dead_letters (
        original_job_id, queue_name, job_name, payload, attempts, last_error
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        job.id,
        job.queue_name,
        job.job_name,
        typeof job.payload === 'string' ? job.payload : JSON.stringify(job.payload),
        job.attempts,
        sanitizeErrorMessage(error).slice(0, 65535),
      ],
    );
  }

  async extendLease(jobId: number, leaseToken: string, lockDurationMs: number): Promise<boolean> {
    if (!Number.isInteger(jobId) || jobId < 1) return false;
    assertValidLeaseToken(leaseToken);
    const lockMs = clampInteger(lockDurationMs, 1000, MAX_LOCK_DURATION_MS, 'lockDurationMs');
    const lockSec = Math.ceil(lockMs / 1000);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      UPDATE mariaboss_jobs
      SET lease_expires_at = UTC_TIMESTAMP(6) + INTERVAL ? SECOND,
          heartbeat_at = UTC_TIMESTAMP(6),
          updated_at = UTC_TIMESTAMP(6)
      WHERE id = ? AND lease_token = ? AND state = 'active'
      `,
      [lockSec, jobId, leaseToken],
    );
    return result.affectedRows > 0;
  }

  async recoverStalled(maxStalledCount: number): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      UPDATE mariaboss_jobs
      SET state = 'pending',
          stalled_count = stalled_count + 1,
          lease_token = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          run_at = UTC_TIMESTAMP(6),
          updated_at = UTC_TIMESTAMP(6)
      WHERE state = 'active'
        AND lease_expires_at < UTC_TIMESTAMP(6)
        AND stalled_count < ?
      `,
      [maxStalledCount],
    );
    return result.affectedRows;
  }

  async cancel(jobId: number): Promise<boolean> {
    if (!Number.isInteger(jobId) || jobId < 1) return false;
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      UPDATE mariaboss_jobs
      SET state = 'cancelled', updated_at = UTC_TIMESTAMP(6)
      WHERE id = ? AND state IN ('pending', 'delayed')
      `,
      [jobId],
    );
    return result.affectedRows > 0;
  }

  async cancelByIdempotencyKey(queueName: string, key: string): Promise<boolean> {
    assertValidQueueName(queueName);
    assertValidIdempotencyKey(key);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      UPDATE mariaboss_jobs
      SET state = 'cancelled', updated_at = UTC_TIMESTAMP(6)
      WHERE queue_name = ? AND idempotency_key = ? AND state IN ('pending', 'delayed')
      `,
      [queueName, key],
    );
    return result.affectedRows > 0;
  }

  async getJob(jobId: number): Promise<JobRow | null> {
    if (!Number.isInteger(jobId) || jobId < 1) return null;
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM mariaboss_jobs WHERE id = ?',
      [jobId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async cleanupCompleted(olderThanMs: number, limit: number): Promise<number> {
    const safeLimit = clampInteger(limit, 1, 10_000, 'limit');
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
      DELETE FROM mariaboss_jobs
      WHERE state = 'completed'
        AND finished_at < UTC_TIMESTAMP(6) - INTERVAL ? SECOND
      LIMIT ?
      `,
      [Math.floor(Math.max(0, olderThanMs) / 1000), safeLimit],
    );
    return result.affectedRows;
  }

  async countByState(queueName: string): Promise<Record<string, number>> {
    assertValidQueueName(queueName);
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `
      SELECT state, COUNT(*) as cnt
      FROM mariaboss_jobs
      WHERE queue_name = ?
      GROUP BY state
      `,
      [queueName],
    );
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.state as string] = Number(r.cnt);
    }
    return out;
  }
}
