import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../src/concurrency/semaphore.js';

describe('Semaphore', () => {
  it('limits concurrency', async () => {
    const sem = new Semaphore(2);
    let max = 0;
    let current = 0;

    const task = async () => {
      await sem.run(async () => {
        current++;
        max = Math.max(max, current);
        await new Promise((r) => setTimeout(r, 50));
        current--;
      });
    };

    await Promise.all([task(), task(), task(), task()]);
    expect(max).toBeLessThanOrEqual(2);
  });
});
