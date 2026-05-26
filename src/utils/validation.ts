import { ValidationError } from '../domain/errors/index.js';

export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
export const MAX_JOB_NAME_LENGTH = 128;
export const MAX_CRON_LENGTH = 128;
export const MAX_TIMEZONE_LENGTH = 64;
export const MAX_BULK_JOBS = 1000;
export const MAX_BATCH_SIZE = 100;
export const MAX_CONCURRENCY = 500;
export const MAX_PRIORITY = 32767;
export const MIN_PRIORITY = -32768;
export const MAX_ATTEMPTS = 100;
export const MAX_DELAY_MS = 86_400_000 * 365;
export const MAX_LOCK_DURATION_MS = 86_400_000;
export const MAX_TIMEOUT_MS = 86_400_000;
export const MAX_ERROR_MESSAGE_LENGTH = 4096;

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MIGRATION_FILE_PATTERN = /^[0-9]{3}_[a-zA-Z0-9_-]+\.sql$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+/-]+$/;
const BUCKET_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const LEASE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidLeaseToken(token: string): void {
  if (!LEASE_TOKEN_PATTERN.test(token)) {
    throw new ValidationError('Invalid lease token format');
  }
}

export function assertValidIdentifier(
  value: string,
  field: string,
  maxLength = MAX_IDENTIFIER_LENGTH,
): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new ValidationError(`Invalid ${field}: length must be 1-${maxLength}`);
  }
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(
      `Invalid ${field}: only letters, numbers, underscore and hyphen allowed`,
    );
  }
}

export function assertValidQueueName(name: string): void {
  assertValidIdentifier(name, 'queue name');
}

export function assertValidJobName(name: string): void {
  assertValidIdentifier(name, 'job name', MAX_JOB_NAME_LENGTH);
}

export function assertValidIdempotencyKey(key: string): void {
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new ValidationError(`idempotency key exceeds ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
  }
  if (!/^[a-zA-Z0-9_:\-.]+$/.test(key)) {
    throw new ValidationError('idempotency key contains invalid characters');
  }
}

export function assertValidMigrationFileName(file: string): void {
  if (!MIGRATION_FILE_PATTERN.test(file)) {
    throw new ValidationError(`Invalid migration file name: ${file}`);
  }
}

export function assertValidTimezone(tz: string): void {
  if (tz.length === 0 || tz.length > MAX_TIMEZONE_LENGTH) {
    throw new ValidationError('Invalid timezone length');
  }
  if (!TIMEZONE_PATTERN.test(tz)) {
    throw new ValidationError('Invalid timezone characters');
  }
}

export function assertValidCronExpression(cron: string): void {
  if (cron.length === 0 || cron.length > MAX_CRON_LENGTH) {
    throw new ValidationError('Invalid cron expression length');
  }
}

export function assertValidBucketKey(key: string): void {
  if (!BUCKET_KEY_PATTERN.test(key)) {
    throw new ValidationError('Invalid rate limit bucket key');
  }
}

export function assertPositiveInteger(value: number, field: string, max?: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(`${field} must not exceed ${max}`);
  }
  return value;
}

export function clampInteger(value: number, min: number, max: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`);
  }
  const n = Math.floor(value);
  return Math.min(max, Math.max(min, n));
}

export function sanitizeErrorMessage(message: string): string {
  const trimmed = String(message).slice(0, MAX_ERROR_MESSAGE_LENGTH);
  let out = '';
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      out += trimmed[i];
    }
  }
  return out;
}
