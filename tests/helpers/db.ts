import {
  getOrCreatePool,
  closeAllPools,
  defaultConnectionOptions,
} from '../../src/infrastructure/mysql/connection.js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getTestPool() {
  return getOrCreatePool(defaultConnectionOptions());
}

export async function resetDatabase(): Promise<void> {
  const pool = getTestPool();
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  const tables = [
    'mariaboss_rate_limits',
    'mariaboss_dead_letters',
    'mariaboss_schedules',
    'mariaboss_queue_stats',
    'mariaboss_jobs',
    'mariaboss_migrations',
  ];
  for (const t of tables) {
    await pool.query(`DROP TABLE IF EXISTS ${t}`);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  const sql = await readFile(join(__dirname, '../../migrations/001_init.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

export async function teardownPools(): Promise<void> {
  await closeAllPools();
}

export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const pool = getTestPool();
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
