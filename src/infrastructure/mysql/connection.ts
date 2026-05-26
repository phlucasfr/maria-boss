import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import type { MariaBossConnectionOptions } from '../../types/connection.js';
import { clampInteger } from '../../utils/validation.js';

const MAX_POOL_SIZE = 100;
const MAX_PORT = 65535;

export function defaultConnectionOptions(): MariaBossConnectionOptions {
  const port = clampInteger(Number(process.env.MARIABOSS_PORT ?? 3307), 1, MAX_PORT, 'port');
  const poolSize = clampInteger(
    Number(process.env.MARIABOSS_POOL_SIZE ?? 10),
    1,
    MAX_POOL_SIZE,
    'pool size',
  );
  return {
    host: process.env.MARIABOSS_HOST ?? '127.0.0.1',
    port,
    user: process.env.MARIABOSS_USER ?? 'mariaboss',
    password: process.env.MARIABOSS_PASSWORD ?? 'mariaboss',
    database: process.env.MARIABOSS_DATABASE ?? 'mariaboss',
    waitForConnections: true,
    connectionLimit: poolSize,
    timezone: 'Z',
    supportBigNumbers: true,
    dateStrings: false,
    multipleStatements: false,
  };
}

const pools = new Map<string, Pool>();

function poolKey(opts: PoolOptions): string {
  const user = typeof opts.user === 'string' ? opts.user : '';
  const database = typeof opts.database === 'string' ? opts.database : '';
  return `${opts.host}:${opts.port}/${database}/${user}`;
}

export function getOrCreatePool(options?: MariaBossConnectionOptions): Pool {
  const opts = { ...defaultConnectionOptions(), ...options, multipleStatements: false };
  if (opts.connectionLimit !== undefined) {
    opts.connectionLimit = clampInteger(opts.connectionLimit, 1, MAX_POOL_SIZE, 'connectionLimit');
  }
  if (opts.port !== undefined) {
    opts.port = clampInteger(Number(opts.port), 1, MAX_PORT, 'port');
  }
  const key = poolKey(opts);
  let pool = pools.get(key);
  if (!pool) {
    pool = mysql.createPool(opts);
    pools.set(key, pool);
  }
  return pool;
}

export async function closeAllPools(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}
