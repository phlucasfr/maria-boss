export class AdaptivePoller {
  private currentInterval: number;

  constructor(
    private readonly minInterval: number,
    private readonly maxInterval: number,
    private readonly multiplier = 1.5,
  ) {
    this.currentInterval = minInterval;
  }

  onJobsFound(): void {
    this.currentInterval = this.minInterval;
  }

  onIdle(): number {
    this.currentInterval = Math.min(
      Math.floor(this.currentInterval * this.multiplier),
      this.maxInterval,
    );
    return this.currentInterval;
  }

  get interval(): number {
    return this.currentInterval;
  }

  reset(): void {
    this.currentInterval = this.minInterval;
  }
}
