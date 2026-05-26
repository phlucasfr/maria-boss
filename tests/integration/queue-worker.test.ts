import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue } from '../../src/queue/queue.js';
import { Worker } from '../../src/worker/worker.js';
import { resetDatabase, teardownPools, isDatabaseAvailable } from '../helpers/db.js';

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('Queue + Worker integration', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await teardownPools();
  });

  it('enqueues and processes a job', async () => {
    const queue = new Queue<{ n: number }>('test-queue');
    const results: number[] = [];

    const worker = new Worker<{ n: number }>(
      'test-queue',
      async (job) => {
        results.push(job.data.n);
      },
      { concurrency: 2, pollInterval: 20, lockDuration: 10_000 },
    );

    await worker.run();
    const { id } = await queue.add('echo', { n: 42 });
    expect(id).toBeGreaterThan(0);

    await viWaitFor(() => results.includes(42), 10_000);
    await worker.close();
    await queue.close();

    expect(results).toContain(42);
  });

  it('retries failed jobs', async () => {
    const queue = new Queue('retry-queue', {
      defaultJobOptions: { attempts: 3, backoff: { type: 'fixed', delay: 100 } },
    });
    let attempts = 0;

    const worker = new Worker(
      'retry-queue',
      async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail once');
      },
      { concurrency: 1, pollInterval: 30 },
    );

    await worker.run();
    await queue.add('flaky', {});
    await viWaitFor(() => attempts >= 2, 15_000);
    await worker.close();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates by jobId', async () => {
    const queue = new Queue('dedup-queue');
    const a = await queue.add('task', { x: 1 }, { jobId: 'unique-1' });
    const b = await queue.add('task', { x: 2 }, { jobId: 'unique-1' });
    expect(a.id).toBe(b.id);
  });

  it('cancels pending job', async () => {
    const queue = new Queue('cancel-queue');
    const { id } = await queue.add('slow', {}, { delay: 60_000 });
    const ok = await queue.cancel(id);
    expect(ok).toBe(true);
  });
});

function viWaitFor(fn: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
      setTimeout(tick, 50);
    };
    tick();
  });
}
