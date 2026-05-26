import type { Pool, PoolConnection } from 'mysql2/promise';
import type { AddJobOptions, DefaultJobOptions } from '../types/job.js';
import type { QueueOptions } from '../types/worker.js';
import { getOrCreatePool } from '../infrastructure/mysql/connection.js';
import { MariaDbJobRepository } from '../infrastructure/repositories/mariadb-job-repository.js';
import { DuplicateJobError, QueueClosedError } from '../domain/errors/index.js';
import { jobsEnqueuedTotal } from '../telemetry/metrics/registry.js';
import { withSpan } from '../telemetry/tracing/tracer.js';
import { childLogger } from '../telemetry/logging/logger.js';
import { assertValidQueueName } from '../domain/queue/queue-name.js';
import {
  assertValidJobName,
  assertValidIdempotencyKey,
  MAX_BULK_JOBS,
} from '../utils/validation.js';
import { ValidationError } from '../domain/errors/index.js';

export class Queue<T = unknown> {
  private readonly pool: Pool;
  private readonly repository: MariaDbJobRepository;
  private closed = false;
  private readonly log = childLogger({ queue: '' });

  constructor(
    public readonly name: string,
    private readonly options: QueueOptions = {},
  ) {
    assertValidQueueName(name);
    this.pool = getOrCreatePool(options.connection);
    this.repository = new MariaDbJobRepository(this.pool);
    this.log = childLogger({ queue: name });
  }

  get defaultJobOptions(): DefaultJobOptions {
    return this.options.defaultJobOptions ?? {};
  }

  async add(jobName: string, data: T, opts?: AddJobOptions): Promise<{ id: number }> {
    if (this.closed) throw new QueueClosedError();
    assertValidJobName(jobName);
    if (opts?.jobId) assertValidIdempotencyKey(opts.jobId);

    return withSpan(
      'mariaboss.queue.add',
      async () => {
        const merged = {
          ...this.defaultJobOptions,
          ...opts,
        };
        try {
          const id = await this.repository.enqueue(
            {
              queueName: this.name,
              jobName,
              payload: data,
              options: merged,
            },
            opts?.connection as PoolConnection | undefined,
          );
          jobsEnqueuedTotal.inc({ queue: this.name });
          this.log.info({ jobId: id, jobName }, 'job enqueued');
          return { id };
        } catch (err) {
          if (err instanceof DuplicateJobError && opts?.jobId) {
            const existing = await this.repository.getJob(
              await this.findIdByIdempotency(opts.jobId),
            );
            if (existing) return { id: existing.id };
          }
          throw err;
        }
      },
      { queue: this.name, jobName },
    );
  }

  private async findIdByIdempotency(key: string): Promise<number> {
    const [rows] = await this.pool.execute(
      `SELECT id FROM mariaboss_jobs WHERE queue_name = ? AND idempotency_key = ? LIMIT 1`,
      [this.name, key],
    );
    const row = (rows as Array<{ id: number }>)[0];
    if (!row) throw new DuplicateJobError();
    return row.id;
  }

  async addBulk(
    jobs: Array<{ name: string; data: T; opts?: AddJobOptions }>,
  ): Promise<Array<{ id: number }>> {
    if (jobs.length > MAX_BULK_JOBS) {
      throw new ValidationError(`Bulk enqueue exceeds maximum of ${MAX_BULK_JOBS} jobs`);
    }
    const results: Array<{ id: number }> = [];
    for (const j of jobs) {
      results.push(await this.add(j.name, j.data, j.opts));
    }
    return results;
  }

  async getJobCounts(): Promise<Record<string, number>> {
    return this.repository.countByState(this.name);
  }

  async cancel(jobId: number): Promise<boolean> {
    return this.repository.cancel(jobId);
  }

  async cancelJob(jobIdOrKey: number | string): Promise<boolean> {
    if (typeof jobIdOrKey === 'number') {
      return this.cancel(jobIdOrKey);
    }
    return this.repository.cancelByIdempotencyKey(this.name, jobIdOrKey);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
