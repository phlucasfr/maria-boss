import { Bench } from 'tinybench';
import { Queue } from '../src/queue/queue.js';
import { resetDatabase, teardownPools, isDatabaseAvailable } from '../tests/helpers/db.js';

const ok = await isDatabaseAvailable();
if (!ok) {
  console.error('DB unavailable');
  process.exit(1);
}
await resetDatabase();
const queue = new Queue('bench-enqueue');
const bench = new Bench({ time: 2000, warmupTime: 300 });
bench.add('enqueue', async () => {
  await queue.add('job', { n: Math.random() });
});
await bench.run();
console.table(
  bench.tasks.map((t) => ({
    name: t.name,
    opsPerSec: t.result?.throughput.mean.toFixed(2),
  })),
);
await teardownPools();
