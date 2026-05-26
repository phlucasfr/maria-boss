import type { Pool, PoolOptions, PoolConnection } from 'mysql2/promise';

export type MariaBossConnectionOptions = PoolOptions;

export interface MariaBossConnection {
  pool: Pool;
  getConnection(): Promise<PoolConnection>;
}

export type { Pool, PoolConnection };
