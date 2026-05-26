import { PayloadTooLargeError } from '../domain/errors/index.js';
import { safeJsonParse } from './safe-json.js';

export const MAX_PAYLOAD_BYTES = 1_048_576;

export function serializePayload(data: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(data ?? null);
  } catch {
    throw new PayloadTooLargeError(MAX_PAYLOAD_BYTES);
  }
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError(MAX_PAYLOAD_BYTES);
  }
  return json;
}

export function parsePayload<T>(raw: string | unknown): T {
  if (typeof raw === 'string') {
    return safeJsonParse<T>(raw, MAX_PAYLOAD_BYTES);
  }
  if (Buffer.isBuffer(raw)) {
    return safeJsonParse<T>(raw.toString('utf8'), MAX_PAYLOAD_BYTES);
  }
  return raw as T;
}
