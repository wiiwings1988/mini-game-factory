/**
 * Fixed-timestep game loop with an injectable scheduler, so tests can advance
 * time deterministically instead of waiting for real frames.
 */
export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

export interface LoopOptions {
  /** Seconds per simulation step. Defaults to 1/60. */
  step?: number;
  /** Largest real-time delta a single frame may advance, in seconds. */
  maxFrameTime?: number;
  /** Up to how many catch-up steps a single rendered frame may run. */
  maxStepsPerFrame?: number;
}

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private readonly step: number;
  private readonly maxFrameTime: number;
  private readonly maxStepsPerFrame: number;

  private handle: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private elapsedSeconds = 0;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
    private readonly scheduler: FrameScheduler,
    options: LoopOptions = {},
  ) {
    this.step = options.step ?? 1 / 60;
    this.maxFrameTime = options.maxFrameTime ?? 0.25;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get elapsed(): number {
    return this.elapsedSeconds;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.scheduler.now();
    this.accumulator = 0;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
  }

  /** Advance by a wall-clock delta in seconds. Public for deterministic tests. */
  advance(deltaSeconds: number): void {
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), this.maxFrameTime);
    this.accumulator += safeDelta;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxStepsPerFrame) {
      this.update(this.step);
      this.accumulator -= this.step;
      this.elapsedSeconds += this.step;
      steps += 1;
    }
    if (steps === this.maxStepsPerFrame) this.accumulator = 0;
    this.render(this.accumulator / this.step);
  }

  private scheduleNext(): void {
    this.handle = this.scheduler.request((timeMs) => {
      if (!this.running) return;
      const delta = (timeMs - this.lastTime) / 1000;
      this.lastTime = timeMs;
      this.advance(delta);
      if (this.running) this.scheduleNext();
    });
  }
}

/** Scheduler backed by requestAnimationFrame (browser / mini game). */
export function rafScheduler(request: (cb: (t: number) => void) => number, cancel: (h: number) => void): FrameScheduler {
  return {
    request: (cb) => request((t) => cb(t)),
    cancel,
    now: () => Date.now(),
  };
}

/** Scheduler that never fires by itself; only `advance` moves time. Tests use it. */
export const manualScheduler = (): FrameScheduler => ({
  request: () => 0,
  cancel: () => {},
  now: () => 0,
});
