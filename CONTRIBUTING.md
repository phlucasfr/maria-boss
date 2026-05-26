# Contributing

Thanks for considering a contribution to MariaBoss.

## Setup

```bash
make install
make docker-up
make migration-up
make test
```

Integration tests need MariaDB reachable on the host configured in `docker-compose.yml` (default port 3307).

## Before you open a PR

```bash
make lint
make format
make test
make check-secrets
```

Match the existing layout: `domain` and `application` hold policies and ports; `infrastructure` talks to MariaDB; `queue` and `worker` are the public entry points.

## Tests

- Unit tests do not require Docker.
- Integration and concurrency tests reset the schema; run them with the database up.

## Releases (maintainers)

1. Bump version with `npm version patch|minor|major`
2. Push commits and tags
3. Create a GitHub release; the publish workflow needs `NPM_TOKEN` in repository secrets
