import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { QueueScheduler } from '../../src/scheduler/queue-scheduler.js';
import { getTestPool, resetDatabase, teardownPools, isDatabaseAvailable } from '../helpers/db.js';

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('QueueScheduler', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await teardownPools();
  });

  it('upserts a cron schedule', async () => {
    const scheduler = new QueueScheduler();
    await scheduler.upsertSchedule({
      queueName: 'cron-queue',
      scheduleName: 'every-minute',
      cron: '* * * * *',
      jobName: 'tick',
      payload: { t: 1 },
    });
    const pool = getTestPool();
    const [rows] = await pool.query(
      `SELECT schedule_name FROM mariaboss_schedules WHERE queue_name = ?`,
      ['cron-queue'],
    );
    expect((rows as Array<{ schedule_name: string }>).length).toBe(1);
    scheduler.stop();
  });
});
