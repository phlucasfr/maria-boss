# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please use [GitHub private security advisories](https://github.com/phlucasfr/maria-boss/security/advisories) or contact the maintainer directly. Do not open public issues for unreported security bugs.

## Threat model

MariaBoss runs inside your Node.js process and uses your MariaDB server.

1. **Database access.** Anyone who can connect to the database with sufficient privileges can read or change queued jobs. Use a dedicated database user with grants limited to `mariaboss_*` tables. Avoid sharing admin credentials with application workers.
2. **Application input.** Queue names, payloads, and cron definitions should be validated in your app before calling `queue.add()` or `QueueScheduler.upsertSchedule()`. The library validates identifiers and payload size, but business rules are your responsibility.
3. **Network.** Use TLS for MariaDB in production (`ssl` in mysql2 pool options).

## Mitigations in the library

| Risk | Mitigation |
|------|------------|
| SQL injection | Parameterized statements; `IN (...)` lists only use numeric job IDs |
| Prototype pollution on decode | `safeJsonParse` strips dangerous keys |
| Large payloads | 1 MiB limit on serialized job data |
| Unsafe migration paths | Filenames must match `NNN_name.sql`; paths are resolved inside the package `migrations/` directory |
| Multi-statement queries | `multipleStatements: false` on worker pools |
| Resource exhaustion | Caps on bulk enqueue, batch size, and worker concurrency |
| Lease misuse | `complete` and `fail` require a valid lease UUID |
| Duplicate job errors | Error messages do not echo the idempotency key |

## Development and CI credentials

Docker Compose and CI use the username and password `mariaboss` only for local and ephemeral test databases. These are not production secrets. In production, set `MARIABOSS_*` environment variables and do not rely on library defaults.

## Secret scanning

Before tagging a release, run:

```bash
make check-secrets
```

Do not commit `.env`, `.npmrc` with tokens, or private keys. See `.gitignore`.

If a real credential was committed, rotate it immediately and rewrite history with a tool such as `git filter-repo`.

## Git history review (May 2026)

Automated scans of all commits found no npm tokens, cloud API keys, or committed `.env` files. Commit metadata (author name and email) is stored as usual in Git objects.

## Consumer checklist

- Node.js 18+
- Idempotent job handlers where side effects must not repeat
- Row binlog format on replicas when using `SKIP LOCKED`
- Do not expose `npx mariaboss migrate` to untrusted users; it uses credentials from the environment
