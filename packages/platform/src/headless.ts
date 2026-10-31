import { InputTracker, manualScheduler, MemoryStorage, RecordingRenderer } from "@factory/engine";
import type { Platform, PlatformServices, Viewport } from "./contracts.js";
import { GuestAuth, NoopShare, UnavailablePurchase } from "./services.js";

export interface HeadlessOptions {
  viewport?: Viewport;
  feedback?: PlatformServices["feedback"];
}

export type HeadlessPlatform = Platform & {
  renderer: RecordingRenderer;
  /** Advance the simulated clock without waiting for real frames. */
  advance(dt: number): void;
};

/** Platform used by tests and CI: deterministic clock, no canvas, no network. */
export function createHeadlessPlatform(options: HeadlessOptions = {}): HeadlessPlatform {
  const viewport: Viewport = options.viewport ?? { width: 360, height: 640, dpr: 1 };
  const storage = new MemoryStorage();
  const renderer = new RecordingRenderer();
  const input = new InputTracker();
  const services: PlatformServices = {
    auth: new GuestAuth(storage),
    purchase: new UnavailablePurchase(),
    feedback:
      options.feedback ??
      ({
        async submit() {
          return { id: "headless", createdAt: new Date(0).toISOString() };
        },
      } as PlatformServices["feedback"]),
    share: new NoopShare(),
  };

  const platform: HeadlessPlatform = {
    name: "headless",
    viewport,
    ctx: renderer,
    input,
    storage,
    scheduler: manualScheduler(),
    services,
    onResize() {
      return () => {};
    },
    destroy() {},
    renderer,
    advance() {},
  };
  return platform;
}
