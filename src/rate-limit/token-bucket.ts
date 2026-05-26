import type { Pool } from 'mysql2/promise';
import { assertValidQueueName, assertValidBucketKey } from '../utils/validation.js';

export interface RateLimitOptions {
  maxPerWindow: number;
  windowMs: number;
}

export class SqlTokenBucketRateLimiter {
  constructor(
    private readonly pool: Pool,
    private readonly queueName: string,
    private readonly options: RateLimitOptions,
  ) {
    assertValidQueueName(queueName);
  }

  async tryAcquire(bucketKey = 'default'): Promise<boolean> {
    assertValidBucketKey(bucketKey);
    const windowSec = Math.ceil(this.options.windowMs / 1000);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `
        SELECT tokens, window_start FROM mariaboss_rate_limits
        WHERE queue_name = ? AND bucket_key = ?
        FOR UPDATE
        `,
        [this.queueName, bucketKey],
      );
      const row = (rows as Array<{ tokens: number; window_start: Date }>)[0];
      const now = new Date();

      if (!row) {
        await conn.execute(
          `
          INSERT INTO mariaboss_rate_limits (queue_name, bucket_key, tokens, window_start)
          VALUES (?, ?, ?, UTC_TIMESTAMP(6))
          `,
          [this.queueName, bucketKey, this.options.maxPerWindow - 1],
        );
        await conn.commit();
        return true;
      }

      const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
      let tokens = row.tokens;
      if (elapsed >= windowSec) {
        tokens = this.options.maxPerWindow;
      }

      if (tokens <= 0) {
        await conn.rollback();
        return false;
      }

      await conn.execute(
        `
        UPDATE mariaboss_rate_limits
        SET tokens = ?, window_start = IF(? >= ?, UTC_TIMESTAMP(6), window_start)
        WHERE queue_name = ? AND bucket_key = ?
        `,
        [tokens - 1, elapsed, windowSec, this.queueName, bucketKey],
      );
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
