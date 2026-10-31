import { InputTracker, rafScheduler, type Storage } from "@factory/engine";
import type { Platform, PlatformServices, Viewport } from "./contracts.js";
import { GuestAuth, HttpFeedback, NoopShare, UnavailablePurchase } from "./services.js";

export interface WebPlatformOptions {
  canvas: HTMLCanvasElement;
  feedbackEndpoint?: string;
  appVersion?: string;
  services?: Partial<PlatformServices>;
}

class LocalStorageAdapter implements Storage {
  constructor(private readonly prefix = "factory.") {}

  get(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      globalThis.localStorage.setItem(this.prefix + key, value);
    } catch {
      /* private mode: progress simply does not persist */
    }
  }

  remove(key: string): void {
    try {
      globalThis.localStorage.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
  }
}

export function createWebPlatform(options: WebPlatformOptions): Platform {
  const { canvas } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  const input = new InputTracker();
  const storage = new LocalStorageAdapter();
  const listeners: Array<() => void> = [];
  const resizeHandlers = new Set<(v: Viewport) => void>();

  const measure = (): Viewport => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 360));
    const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 640));
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    return { width, height, dpr };
  };

  let viewport = measure();

  const applySize = (): void => {
    viewport = measure();
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    for (const handler of resizeHandlers) handler(viewport);
  };
  applySize();

  const toGame = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onDown = (event: PointerEvent): void => {
    const p = toGame(event);
    input.downAt(p.x, p.y);
  };
  const onMove = (event: PointerEvent): void => {
    const p = toGame(event);
    input.move(p.x, p.y);
  };
  const onUp = (event: PointerEvent): void => {
    const p = toGame(event);
    input.upAt(p.x, p.y);
  };
  const onLeave = (): void => input.cancel();

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  listeners.push(() => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
  });

  const onResize = (): void => applySize();
  globalThis.addEventListener("resize", onResize);
  listeners.push(() => globalThis.removeEventListener("resize", onResize));

  const services: PlatformServices = {
    auth: options.services?.auth ?? new GuestAuth(storage),
    purchase: options.services?.purchase ?? new UnavailablePurchase(),
    feedback:
      options.services?.feedback ??
      new HttpFeedback({
        endpoint: options.feedbackEndpoint ?? "/api/feedback",
        appVersion: options.appVersion,
      }),
    share: options.services?.share ?? new NoopShare(),
  };

  return {
    name: "web",
    get viewport() {
      return viewport;
    },
    ctx: ctx as unknown as Platform["ctx"],
    input,
    storage,
    scheduler: rafScheduler(
      (cb) => globalThis.requestAnimationFrame(cb),
      (h) => globalThis.cancelAnimationFrame(h),
    ),
    services,
    onResize(handler) {
      resizeHandlers.add(handler);
      handler(viewport);
      return () => resizeHandlers.delete(handler);
    },
    destroy() {
      for (const off of listeners) off();
      listeners.length = 0;
      resizeHandlers.clear();
    },
  };
}
