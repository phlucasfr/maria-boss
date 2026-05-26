import type { Pool } from 'mysql2/promise';
import type { JobData } from '../types/job.js';
import type { JobProcessor, WorkerContext, WorkerOptions } from '../types/worker.js';
import { getOrCreatePool } from '../infrastructure/mysql/connection.js';
import { MariaDbJobRepository } from '../infrastructure/repositories/mariadb-job-repository.js';
import { rowToJob } from '../application/services/job-mapper.js';
import { Semaphore } from '../concurrency/semaphore.js';
import { AdaptivePoller } from '../concurrency/adaptive-poll.js';
import { RecoveryRunner } from '../recovery/recovery-runner.js';
import { toBackoffConfig } from '../retry/backoff.js';
import { generateWorkerId } from '../utils/uuid.js';
import {
  jobsCompletedTotal,
  jobsFailedTotal,
  claimLatencyMs,
  activeJobsGauge,
} from '../telemetry/metrics/registry.js';
import { withSpan } from '../telemetry/tracing/tracer.js';
import { childLogger } from '../telemetry/logging/logger.js';
import {
  assertValidQueueName,
  clampInteger,
  MAX_CONCURRENCY,
  MAX_BATCH_SIZE,
} from '../utils/validation.js';

export class Worker<T = unknown> {
  private readonly pool: Pool;
  private readonly repository: MariaDbJobRepository;
  private readonly semaphore: Semaphore;
  private readonly poller: AdaptivePoller;
  private readonly workerId: string;
  private readonly recovery: RecoveryRunner;
  private running = false;
  private closed = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly inFlight = new Set<number>();
  private readonly log: ReturnType<typeof childLogger>;

  constructor(
    public readonly queueName: string,
    private readonly processor: JobProcessor<T>,
    private readonly options: WorkerOptions = {},
  ) {
    assertValidQueueName(queueName);
    this.pool = getOrCreatePool(options.connection);
    this.repository = new MariaDbJobRepository(this.pool);
    const concurrency = clampInteger(options.concurrency ?? 1, 1, MAX_CONCURRENCY, 'concurrency');
    this.semaphore = new Semaphore(concurrency);
    this.poller = new AdaptivePoller(options.pollInterval ?? 50, options.maxPollInterval ?? 500);
    this.workerId = options.workerId ?? generateWorkerId();
    this.recovery = new RecoveryRunner(this.repository, {
      intervalMs: options.stalledInterval ?? 30_000,
      maxStalledCount: options.maxStalledCount ?? 2,
    });
    this.log = childLogger({ queue: queueName, workerId: this.workerId });
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.closed = false;
    this.recovery.start();
    if (this.options.heartbeatInterval) {
      this.heartbeatTimer = setInterval(
        () => void this.heartbeatAll(),
        this.options.heartbeatInterval,
      );
    }
    this.schedulePoll();
    this.log.info('worker started');
  }

  private schedulePoll(): void {
    if (this.closed) return;
    const delay = this.running ? this.poller.interval : (this.options.pollInterval ?? 50);
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    const slots = this.semaphore.available;
    if (slots <= 0) {
      this.schedulePoll();
      return;
    }

    const batchSize = Math.min(
      clampInteger(this.options.batchSize ?? slots, 1, MAX_BATCH_SIZE, 'batchSize'),
      slots,
    );
    const lockDuration = this.options.lockDuration ?? 30_000;
    const start = Date.now();

    try {
      const rows = await withSpan(
        'mariaboss.worker.claim',
        () =>
          this.repository.claim({
            queueName: this.queueName,
            batchSize,
            leaseOwner: this.workerId,
            lockDurationMs: lockDuration,
          }),
        { queue: this.queueName },
      );

      claimLatencyMs.observe({ queue: this.queueName }, Date.now() - start);

      if (rows.length === 0) {
        this.poller.onIdle();
        this.schedulePoll();
        return;
      }

      this.poller.onJobsFound();
      activeJobsGauge.inc({ queue: this.queueName }, rows.length);

      for (const row of rows) {
        if (this.inFlight.has(row.id)) continue;
        this.inFlight.add(row.id);
        void this.semaphore.run(() => this.processJob(rowToJob<T>(row), row.lease_token!));
      }
    } catch (err) {
      this.log.error({ err }, 'poll failed');
    }

    this.schedulePoll();
  }

  private async processJob(job: JobData<T>, leaseToken: string): Promise<void> {
    const lockDuration = this.options.lockDuration ?? 30_000;
    const timeoutMs = job.timeoutMs ?? this.options.defaultJobOptions?.timeout ?? null;
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    }

    const ctx: WorkerContext = {
      signal: controller.signal,
      leaseToken,
      extendLock: (durationMs) =>
        this.repository.extendLease(job.id, leaseToken, durationMs ?? lockDuration),
    };

    try {
      await withSpan('mariaboss.worker.process', () => this.processor(job, ctx), {
        queue: this.queueName,
        jobId: job.id,
        jobName: job.name,
      });
      const ok = await this.repository.complete(job.id, leaseToken);
      if (ok) {
        jobsCompletedTotal.inc({ queue: this.queueName });
        this.log.info({ jobId: job.id }, 'job completed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const backoff = toBackoffConfig(this.options.defaultJobOptions?.backoff);
      const moveToDlq = job.attempts >= job.maxAttempts;
      await this.repository.fail(job.id, leaseToken, message, backoff, moveToDlq);
      jobsFailedTotal.inc({ queue: this.queueName });
      if (moveToDlq) {
        this.log.warn({ jobId: job.id }, 'job moved to DLQ');
      } else {
        this.log.info({ jobId: job.id, err: message }, 'job scheduled for retry');
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      this.inFlight.delete(job.id);
      activeJobsGauge.dec({ queue: this.queueName });
    }
  }

  private async heartbeatAll(): Promise<void> {
    const lockDuration = this.options.lockDuration ?? 30_000;
    for (const id of this.inFlight) {
      const row = await this.repository.getJob(id);
      if (row?.lease_token) {
        await this.repository.extendLease(id, row.lease_token, lockDuration);
      }
    }
  }

  async close(gracePeriodMs = 30_000): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.running = false;
    this.recovery.stop();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    const deadline = Date.now() + gracePeriodMs;
    while (this.inFlight.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    this.log.info('worker closed');
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    if (!this.closed) {
      this.running = true;
      this.schedulePoll();
    }
  }
}
