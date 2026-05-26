import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type Pool } from 'mysql2/promise';
import { defaultConnectionOptions } from '../mysql/connection.js';
import type { MariaBossConnectionOptions } from '../../types/connection.js';
import { assertValidMigrationFileName } from '../../utils/validation.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Migrations folder inside the installed package (npm, git, or monorepo). */
export function getMigrationsDir(): string {
  try {
    const pkgJson = require.resolve('mariaboss/package.json');
    return join(dirname(pkgJson), 'migrations');
  } catch {
    return join(__dirname, '..', '..', '..', 'migrations');
  }
}

function resolveMigrationPath(migrationsDir: string, file: string): string {
  assertValidMigrationFileName(file);
  const base = resolve(migrationsDir);
  const full = resolve(base, file);
  const rel = relative(base, full);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Migration path escapes migrations directory: ${file}`);
  }
  return full;
}

export async function createMigrationPool(connection?: MariaBossConnectionOptions): Promise<Pool> {
  return mysql.createPool({
    ...defaultConnectionOptions(),
    ...connection,
    multipleStatements: false,
  });
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mariaboss_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB
  `);
}

async function getApplied(pool: Pool): Promise<Set<string>> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT name FROM mariaboss_migrations ORDER BY id',
  );
  return new Set(rows.map((r) => r.name as string));
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

export async function migrateUp(
  connection?: MariaBossConnectionOptions,
  migrationsDir = getMigrationsDir(),
): Promise<string[]> {
  const resolvedDir = resolve(migrationsDir);
  const pool = await createMigrationPool(connection);
  const appliedNames: string[] = [];
  try {
    await ensureMigrationsTable(pool);
    const applied = await getApplied(pool);
    const files = (await readdir(resolvedDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      assertValidMigrationFileName(file);
      if (applied.has(file)) continue;
      const path = resolveMigrationPath(resolvedDir, file);
      const sql = await readFile(path, 'utf8');
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of splitStatements(sql)) {
          await conn.execute(stmt);
        }
        await conn.execute('INSERT INTO mariaboss_migrations (name) VALUES (?)', [file]);
        await conn.commit();
        appliedNames.push(file);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  } finally {
    await pool.end();
  }
  return appliedNames;
}

export async function migrateDown(connection?: MariaBossConnectionOptions): Promise<string | null> {
  const pool = await createMigrationPool(connection);
  try {
    await ensureMigrationsTable(pool);
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT name FROM mariaboss_migrations ORDER BY id DESC LIMIT 1',
    );
    if (rows.length === 0) return null;

    const last = rows[0]!.name as string;
    assertValidMigrationFileName(last);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DROP TABLE IF EXISTS mariaboss_rate_limits');
      await conn.execute('DROP TABLE IF EXISTS mariaboss_queue_stats');
      await conn.execute('DROP TABLE IF EXISTS mariaboss_dead_letters');
      await conn.execute('DROP TABLE IF EXISTS mariaboss_schedules');
      await conn.execute('DROP TABLE IF EXISTS mariaboss_jobs');
      await conn.execute('DELETE FROM mariaboss_migrations WHERE name = ?', [last]);
      await conn.commit();
      return last;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}
