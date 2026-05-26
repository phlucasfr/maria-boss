import { randomUUID } from 'node:crypto';

export function generateLeaseToken(): string {
  return randomUUID();
}

export function generateWorkerId(prefix = 'worker'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
