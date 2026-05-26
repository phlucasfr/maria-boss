export class Semaphore {
  private current = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get available(): number {
    return Math.max(0, this.max - this.current);
  }

  get active(): number {
    return this.current;
  }

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.current++;
    return () => this.release();
  }

  private release(): void {
    this.current--;
    const next = this.waiters.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
