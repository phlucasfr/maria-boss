import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue } from '../../src/queue/queue.js';
import { Worker } from '../../src/worker/worker.js';
import { resetDatabase, teardownPools, isDatabaseAvailable } from '../helpers/db.js';

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('multi-worker concurrency', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await teardownPools();
  });

  it('processes many jobs without duplicate completion', async () => {
    const queue = new Queue<number>('concurrent-queue');
    const jobCount = 200;
    const processed = new Set<number>();

    for (let i = 0; i < jobCount; i++) {
      await queue.add('item', i);
    }

    const workers = Array.from({ length: 4 }, (_, idx) => {
      const w = new Worker<number>(
        'concurrent-queue',
        async (job) => {
          if (processed.has(job.data)) {
            throw new Error(`duplicate process: ${job.data}`);
          }
          processed.add(job.data);
          await new Promise((r) => setTimeout(r, 5));
        },
        {
          concurrency: 10,
          pollInterval: 10,
          batchSize: 5,
          workerId: `worker-${idx}`,
        },
      );
      void w.run();
      return w;
    });

    await waitUntil(async () => processed.size >= jobCount, 60_000);

    for (const w of workers) {
      await w.close();
    }

    expect(processed.size).toBe(jobCount);
  }, 90_000);
});

async function waitUntil(fn: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timeout waiting for condition');
}
