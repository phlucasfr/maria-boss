import { describe, it, expect } from 'vitest';
import {
  assertValidQueueName,
  assertValidIdempotencyKey,
  assertValidMigrationFileName,
  sanitizeErrorMessage,
} from '../../src/utils/validation.js';
import { safeJsonParse } from '../../src/utils/safe-json.js';
import { ValidationError } from '../../src/domain/errors/index.js';

describe('validation', () => {
  it('rejects invalid queue names', () => {
    expect(() => assertValidQueueName('')).toThrow(ValidationError);
    expect(() => assertValidQueueName('a b')).toThrow(ValidationError);
    expect(() => assertValidQueueName('queue;drop')).toThrow(ValidationError);
  });

  it('accepts valid queue names', () => {
    expect(() => assertValidQueueName('emails_v2')).not.toThrow();
  });

  it('rejects oversized idempotency keys', () => {
    expect(() => assertValidIdempotencyKey('x'.repeat(300))).toThrow(ValidationError);
  });

  it('rejects path-like migration files', () => {
    expect(() => assertValidMigrationFileName('../evil.sql')).toThrow(ValidationError);
    expect(() => assertValidMigrationFileName('001_init.sql')).not.toThrow();
  });

  it('sanitizes control chars in errors', () => {
    expect(sanitizeErrorMessage('ok\x00bad')).toBe('okbad');
  });
});

describe('safeJsonParse', () => {
  it('blocks prototype pollution keys', () => {
    const raw = '{"__proto__":{"polluted":true},"a":1}';
    const parsed = safeJsonParse<Record<string, unknown>>(raw, 1024);
    expect(parsed.a).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
  });
});
