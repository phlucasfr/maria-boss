-- MariaBoss initial schema (MariaDB 10.6+)

CREATE TABLE IF NOT EXISTS mariaboss_migrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mariaboss_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  queue_name VARCHAR(128) NOT NULL,
  job_name VARCHAR(128) NOT NULL,
  payload JSON NOT NULL,
  state ENUM(
    'pending',
    'active',
    'completed',
    'failed',
    'cancelled',
    'delayed'
  ) NOT NULL DEFAULT 'pending',
  priority SMALLINT NOT NULL DEFAULT 0,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
  stalled_count INT UNSIGNED NOT NULL DEFAULT 0,
  run_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  lease_owner VARCHAR(128) NULL,
  lease_token CHAR(36) NULL,
  lease_expires_at DATETIME(6) NULL,
  heartbeat_at DATETIME(6) NULL,
  timeout_ms INT UNSIGNED NULL,
  started_at DATETIME(6) NULL,
  finished_at DATETIME(6) NULL,
  idempotency_key VARCHAR(255) NULL,
  dedup_key VARCHAR(255) NULL,
  parent_id BIGINT UNSIGNED NULL,
  trace_context JSON NULL,
  last_error TEXT NULL,
  rate_limit_bucket VARCHAR(64) NULL,
  remove_on_complete TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_claim (queue_name, state, run_at, priority, id),
  KEY idx_stalled (state, lease_expires_at),
  KEY idx_completed_at (state, finished_at),
  UNIQUE KEY uk_queue_idempotency (queue_name, idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mariaboss_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  queue_name VARCHAR(128) NOT NULL,
  schedule_name VARCHAR(128) NOT NULL,
  cron_expr VARCHAR(128) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  job_name VARCHAR(128) NOT NULL,
  job_template JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  next_run_at DATETIME(6) NOT NULL,
  last_run_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_schedule (queue_name, schedule_name),
  KEY idx_next_run (enabled, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mariaboss_dead_letters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  original_job_id BIGINT UNSIGNED NOT NULL,
  queue_name VARCHAR(128) NOT NULL,
  job_name VARCHAR(128) NOT NULL,
  payload JSON NOT NULL,
  attempts INT UNSIGNED NOT NULL,
  last_error TEXT NULL,
  failed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_dlq_queue (queue_name, failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mariaboss_rate_limits (
  queue_name VARCHAR(128) NOT NULL,
  bucket_key VARCHAR(64) NOT NULL,
  tokens INT NOT NULL DEFAULT 0,
  window_start DATETIME(6) NOT NULL,
  PRIMARY KEY (queue_name, bucket_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mariaboss_queue_stats (
  queue_name VARCHAR(128) NOT NULL PRIMARY KEY,
  pending_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  active_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  completed_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  failed_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
