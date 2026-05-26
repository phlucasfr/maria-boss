import { Queue } from '../../src/queue/queue.js';
import { resetDatabase, teardownPools, isDatabaseAvailable } from '../helpers/db.js';

const COUNT = Number(process.env.STRESS_COUNT ?? 5000);

async function main() {
  if (!(await isDatabaseAvailable())) {
    console.error('Database not available');
    process.exit(1);
  }
  await resetDatabase();
  const queue = new Queue('stress');
  const start = Date.now();
  for (let i = 0; i < COUNT; i++) {
    await queue.add('flood', { i });
  }
  const elapsed = Date.now() - start;
  console.log(
    `Enqueued ${COUNT} jobs in ${elapsed}ms (${((COUNT / elapsed) * 1000).toFixed(0)} jobs/s)`,
  );
  await teardownPools();
}

await main();
