const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Parse JSON safely: rejects oversized input and blocks prototype-pollution keys.
 */
export function safeJsonParse<T = unknown>(raw: string, maxBytes: number): T {
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new Error('JSON payload exceeds size limit');
  }

  return JSON.parse(raw, (key, value) => {
    if (FORBIDDEN_KEYS.has(key)) {
      return undefined;
    }
    return value;
  }) as T;
}
