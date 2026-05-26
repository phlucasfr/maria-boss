import type { IJobRepository } from '../application/ports/job-repository.js';
import { jobsStalledTotal } from '../telemetry/metrics/registry.js';
import { childLogger } from '../telemetry/logging/logger.js';

export interface RecoveryRunnerOptions {
  intervalMs: number;
  maxStalledCount: number;
}

export class RecoveryRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly log = childLogger({ component: 'recovery' });

  constructor(
    private readonly repository: IJobRepository,
    private readonly options: RecoveryRunnerOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const count = await this.repository.recoverStalled(this.options.maxStalledCount);
      if (count > 0) {
        jobsStalledTotal.inc(count);
        this.log.info({ count }, 'recovered stalled jobs');
      }
    } catch (err) {
      this.log.error({ err }, 'recovery tick failed');
    }
  }
}
