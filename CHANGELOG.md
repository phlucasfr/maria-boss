# Changelog

All notable changes to this project are documented here.

## [0.1.0]

### Added

- `Queue` and `Worker` with MariaDB-backed storage
- Job claiming with `FOR UPDATE SKIP LOCKED` and lease tokens
- Retries, exponential backoff, stalled recovery, and dead-letter storage
- Delayed jobs and `QueueScheduler` for cron-style work
- CLI `mariaboss migrate` and programmatic `migrateUp` / `migrateDown`
- Prometheus metrics and OpenTelemetry span helpers
- Input validation, payload limits, and migration path checks

### Notes

Install from npm after publish, or from Git (`github:phlucasfr/maria-boss#v0.1.0`). See `docs/INSTALL.md`.
