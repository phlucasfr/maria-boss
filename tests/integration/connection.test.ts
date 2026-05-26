import { describe, it, expect, afterAll } from 'vitest';
import { getTestPool, teardownPools, isDatabaseAvailable } from '../helpers/db.js';

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('mysql connection', () => {
  afterAll(async () => {
    await teardownPools();
  });

  it('connects to MariaDB', async () => {
    const pool = getTestPool();
    const [rows] = await pool.query('SELECT VERSION() as v');
    const version = (rows as Array<{ v: string }>)[0]?.v ?? '';
    expect(version).toBeTruthy();
  });
});
