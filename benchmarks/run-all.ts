import { Bench } from 'tinybench';
import { Queue } from '../src/queue/queue.js';
import { resetDatabase, teardownPools, isDatabaseAvailable } from '../tests/helpers/db.js';
import { writeFile } from 'node:fs/promises';

async function main() {
  if (!(await isDatabaseAvailable())) {
    console.error('Database not available. Run: make docker-up && make migration-up');
    process.exit(1);
  }

  await resetDatabase();
  const results: Record<string, number> = {};

  const bench = new Bench({ time: 3000, warmupTime: 500 });

  bench.add('enqueue throughput', async () => {
    const queue = new Queue('bench-enqueue');
    await queue.add('job', { i: Math.random() });
  });

  bench.add('claim+complete cycle', async () => {
    const queue = new Queue('bench-e2e');
    const { id } = await queue.add('job', { v: 1 });
    const pool = (await import('../src/infrastructure/mysql/connection.js')).getOrCreatePool();
    const repo = new (
      await import('../src/infrastructure/repositories/mariadb-job-repository.js')
    ).MariaDbJobRepository(pool);
    const rows = await repo.claim({
      queueName: 'bench-e2e',
      batchSize: 1,
      leaseOwner: 'bench',
      lockDurationMs: 5000,
    });
    if (rows[0]) await repo.complete(rows[0].id, rows[0].lease_token!);
    void id;
  });

  await bench.run();
  for (const task of bench.tasks) {
    if (task.result) {
      results[task.name ?? 'unknown'] = task.result.throughput.mean;
      console.log(`${task.name}: ${task.result.throughput.mean.toFixed(2)} ops/s`);
    }
  }

  await teardownPools();
  await writeFile('benchmark-results.json', JSON.stringify(results, null, 2));
}

await main();
