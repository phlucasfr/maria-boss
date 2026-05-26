import type { Pool } from 'mysql2/promise';
import { CronExpressionParser } from 'cron-parser';
import type { MariaBossConnectionOptions } from '../types/connection.js';
import { getOrCreatePool } from '../infrastructure/mysql/connection.js';
import { MariaDbJobRepository } from '../infrastructure/repositories/mariadb-job-repository.js';
import { childLogger } from '../telemetry/logging/logger.js';
import {
  assertValidQueueName,
  assertValidJobName,
  assertValidIdentifier,
  assertValidCronExpression,
  assertValidTimezone,
} from '../utils/validation.js';
import { serializePayload, MAX_PAYLOAD_BYTES } from '../utils/serialize.js';
import { safeJsonParse } from '../utils/safe-json.js';

export interface ScheduleOptions {
  queueName: string;
  scheduleName: string;
  cron: string;
  timezone?: string;
  jobName: string;
  payload: unknown;
  enabled?: boolean;
}

export class QueueScheduler {
  private readonly pool: Pool;
  private readonly repository: MariaDbJobRepository;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly log = childLogger({ component: 'scheduler' });

  constructor(
    private readonly options: { connection?: MariaBossConnectionOptions; tickMs?: number } = {},
  ) {
    this.pool = getOrCreatePool(options.connection);
    this.repository = new MariaDbJobRepository(this.pool);
  }

  async upsertSchedule(opts: ScheduleOptions): Promise<void> {
    assertValidQueueName(opts.queueName);
    assertValidIdentifier(opts.scheduleName, 'schedule name');
    assertValidJobName(opts.jobName);
    assertValidCronExpression(opts.cron);
    const tz = opts.timezone ?? 'UTC';
    assertValidTimezone(tz);
    const payloadJson = serializePayload(opts.payload);
    const interval = CronExpressionParser.parse(opts.cron, {
      tz,
    });
    const next = interval.next().toDate();
    await this.pool.execute(
      `
      INSERT INTO mariaboss_schedules (
        queue_name, schedule_name, cron_expr, timezone, job_name, job_template, next_run_at, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        cron_expr = VALUES(cron_expr),
        timezone = VALUES(timezone),
        job_name = VALUES(job_name),
        job_template = VALUES(job_template),
        next_run_at = VALUES(next_run_at),
        enabled = VALUES(enabled),
        updated_at = UTC_TIMESTAMP(6)
      `,
      [
        opts.queueName,
        opts.scheduleName,
        opts.cron,
        tz,
        opts.jobName,
        payloadJson,
        next,
        opts.enabled !== false ? 1 : 0,
      ],
    );
  }

  start(): void {
    if (this.timer) return;
    const tickMs = this.options.tickMs ?? 5000;
    this.timer = setInterval(() => void this.tick(), tickMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const [rows] = await this.pool.execute(
      `
      SELECT id, queue_name, schedule_name, cron_expr, timezone, job_name, job_template
      FROM mariaboss_schedules
      WHERE enabled = 1 AND next_run_at <= UTC_TIMESTAMP(6)
      LIMIT 50
      `,
    );
    const schedules = rows as Array<{
      id: number;
      queue_name: string;
      schedule_name: string;
      cron_expr: string;
      timezone: string;
      job_name: string;
      job_template: string;
    }>;

    for (const s of schedules) {
      try {
        const template =
          typeof s.job_template === 'string' ? s.job_template : JSON.stringify(s.job_template);
        const payload = safeJsonParse(template, MAX_PAYLOAD_BYTES);
        assertValidQueueName(s.queue_name);
        assertValidJobName(s.job_name);
        assertValidCronExpression(s.cron_expr);
        assertValidTimezone(s.timezone);
        await this.repository.enqueue({
          queueName: s.queue_name,
          jobName: s.job_name,
          payload,
        });
        const interval = CronExpressionParser.parse(s.cron_expr, { tz: s.timezone });
        const next = interval.next().toDate();
        await this.pool.execute(
          `UPDATE mariaboss_schedules SET next_run_at = ?, last_run_at = UTC_TIMESTAMP(6) WHERE id = ?`,
          [next, s.id],
        );
        this.log.info({ schedule: s.schedule_name, queue: s.queue_name }, 'cron job enqueued');
      } catch (err) {
        this.log.error({ err, schedule: s.schedule_name }, 'cron tick failed');
      }
    }
  }
}
