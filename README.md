# MariaBoss

[![CI](https://github.com/phlucasfr/maria-boss/actions/workflows/ci.yml/badge.svg)](https://github.com/phlucasfr/maria-boss/actions/workflows/ci.yml)

MariaBoss is a job queue library for Node.js (TypeScript, ESM) that stores jobs in **MariaDB 10.6+** and coordinates workers with `SELECT ... FOR UPDATE SKIP LOCKED`.

If you already run MariaDB and want background work without adding Redis, the API should feel familiar: enqueue from your app, process with `Worker`, configure retries and delays in code. The design borrows ideas from [BullMQ](https://github.com/taskforcesh/bullmq) (ergonomics) and [pg-boss](https://github.com/timgit/pg-boss) (SQL locking).

## Requirements

- Node.js 18+ (see `.nvmrc` for the version used in CI)
- MariaDB 10.6+ with InnoDB
- Row-based binlog if you replicate (needed for correct `SKIP LOCKED` behavior on replicas)

## Install

From npm (after publish):

```bash
npm install mariaboss
```

From a private GitHub repository:

```json
{
  "dependencies": {
    "mariaboss": "github:phlucasfr/maria-boss#v0.1.0"
  }
}
```

See [docs/INSTALL.md](docs/INSTALL.md) for SSH, local `file:` installs, and GitHub Packages.

Create the schema once per database:

```bash
npx mariaboss migrate
```

Connection settings are read from `MARIABOSS_HOST`, `MARIABOSS_PORT`, `MARIABOSS_USER`, `MARIABOSS_PASSWORD`, and `MARIABOSS_DATABASE`, or passed in the `connection` option (see below).

## Quick start

Producer (API or script):

```typescript
import { Queue } from 'mariaboss';

const queue = new Queue('emails', {
  connection: {
    host: '127.0.0.1',
    port: 3306,
    user: 'mariaboss',
    password: 'mariaboss',
    database: 'mariaboss',
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

await queue.add('send-email', { userId: 1 }, { priority: 10, delay: 60_000 });
```

Consumer (separate process):

```typescript
import { Worker } from 'mariaboss';

const worker = new Worker(
  'emails',
  async (job, ctx) => {
    ctx.signal.throwIfAborted();
    await sendEmail(job.data);
  },
  {
    concurrency: 50,
    lockDuration: 30_000,
    stalledInterval: 30_000,
  },
);

await worker.run();

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
```

## What is included

- Concurrent dequeue with `SKIP LOCKED` and lease tokens
- Retries with fixed or exponential backoff and jitter
- Delayed jobs (`delay` / `run_at`)
- Cron-style schedules via `QueueScheduler`
- Stalled job recovery and dead-letter records
- Job deduplication with `jobId` (idempotency key)
- Cancel pending jobs
- Transactional enqueue when you share a mysql2 connection
- Structured logs (pino), Prometheus metrics, OpenTelemetry hooks
- CLI: `npx mariaboss migrate`

## Delivery semantics

Jobs are delivered **at least once**. A worker crash or lease expiry can cause a job to run again. Use idempotent handlers and `jobId` when you need to avoid duplicate side effects.

## Development

```bash
make install
make docker-up
make migration-up
make test
make lint
make format
```

## Publishing

```bash
npm version patch
git push --follow-tags
```

Create a GitHub release for the tag. The [publish workflow](.github/workflows/publish.yml) publishes to npm when `NPM_TOKEN` is configured.

## Security

See [SECURITY.md](SECURITY.md) for how to report issues and how credentials and payloads should be handled.

## License

MIT. See [LICENSE](LICENSE).
