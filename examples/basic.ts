import { Queue, Worker } from 'mariaboss';

const queue = new Queue('emails', {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

await queue.add('send-email', { userId: 1 }, { priority: 10 });

const worker = new Worker(
  'emails',
  async (job, ctx) => {
    ctx.signal.throwIfAborted();
    console.log('Processing', job.name, job.data);
  },
  { concurrency: 50, lockDuration: 30_000 },
);

await worker.run();

process.on('SIGINT', async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
});
