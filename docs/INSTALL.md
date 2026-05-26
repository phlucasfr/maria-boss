# Installing MariaBoss in your application

## Requirements

- Node.js 18 or newer (20 LTS recommended; see `.nvmrc` in this repo)
- MariaDB 10.6 or newer with InnoDB

## npm registry

```bash
npm install mariaboss
```

## Git dependency (private or public repository)

Add to your app `package.json`:

```json
{
  "dependencies": {
    "mariaboss": "github:phlucasfr/maria-boss#v0.1.0"
  }
}
```

SSH URL form:

```json
"mariaboss": "git+ssh://git@github.com/phlucasfr/maria-boss.git#v0.1.0"
```

For HTTPS against a private repo, use a personal access token with `repo` scope. Do not commit the token; inject it in CI via secrets.

```json
"mariaboss": "git+https://<TOKEN>@github.com/phlucasfr/maria-boss.git#v0.1.0"
```

Then run `npm install`.

Git installs clone source. The package `prepare` script builds when TypeScript is available. For a predictable install, depend on a release tag and publish built artifacts to npm, or use `file:` during local development:

```json
"mariaboss": "file:../maria-boss"
```

```bash
cd ../maria-boss && npm run build
cd ../your-app && npm install
```

## Database schema

Set connection environment variables (or pass `connection` in code):

```bash
export MARIABOSS_HOST=127.0.0.1
export MARIABOSS_PORT=3306
export MARIABOSS_USER=mariaboss
export MARIABOSS_PASSWORD=your-password
export MARIABOSS_DATABASE=mariaboss
```

Apply migrations from the app project:

```bash
npx mariaboss migrate
```

Programmatic alternative:

```typescript
import { migrateUp } from 'mariaboss';

await migrateUp({
  host: '127.0.0.1',
  port: 3306,
  user: 'mariaboss',
  password: process.env.DB_PASSWORD,
  database: 'mariaboss',
});
```

## Application code

MariaBoss is ESM-only. Your app should use `"type": "module"` or a bundler that resolves ESM.

```typescript
import { Queue, Worker } from 'mariaboss';

const queue = new Queue('emails', {
  connection: {
    host: process.env.MARIABOSS_HOST,
    port: Number(process.env.MARIABOSS_PORT ?? 3306),
    user: process.env.MARIABOSS_USER,
    password: process.env.MARIABOSS_PASSWORD,
    database: process.env.MARIABOSS_DATABASE,
  },
});

await queue.add('send-email', { userId: 1 });

const worker = new Worker(
  'emails',
  async (job, ctx) => {
    ctx.signal.throwIfAborted();
    // handler logic
  },
  { concurrency: 10 },
);

await worker.run();
```

Run at least one worker process per queue you need to drain. Producers and consumers can live in different services as long as they share the same database and queue name.

## GitHub Packages (optional)

To publish under a scope (for example `@phlucasfr/mariaboss`), configure `publishConfig.registry` in this library and add an `.npmrc` in consuming projects:

```
@phlucasfr:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Maintainer release checklist

1. `npm version patch` (or minor/major)
2. `git push && git push --tags`
3. Open a GitHub release for the tag
4. Confirm CI publish with `NPM_TOKEN` on the repository
