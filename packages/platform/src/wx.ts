import { InputTracker, rafScheduler, type Storage } from "@factory/engine";
import type { Platform, PlatformServices, Viewport } from "./contracts.js";
import { GuestAuth, NoopShare, UnavailablePurchase } from "./services.js";

/**
 * WeChat mini game host. The mini game runtime has a canvas and touch events but
 * no DOM, which is exactly why the engine never touches `document`.
 *
 * Types below are the slice of the `wx` global we rely on (WeChat ships no .d.ts
 * here); keep this list small so the adapter stays auditable.
 */
interface WxTouch {
  clientX: number;
  clientY: number;
}
interface WxTouchEvent {
  touches: WxTouch[];
  changedTouches: WxTouch[];
}
interface WxCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): unknown;
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  cancelAnimationFrame?: (h: number) => void;
}
interface WxApi {
  createCanvas(): WxCanvas;
  getSystemInfoSync(): { windowWidth: number; windowHeight: number; pixelRatio: number; safeArea?: unknown };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  onTouchStart(cb: (e: WxTouchEvent) => void): void;
  onTouchMove(cb: (e: WxTouchEvent) => void): void;
  onTouchEnd(cb: (e: WxTouchEvent) => void): void;
  onTouchCancel(cb: (e: WxTouchEvent) => void): void;
  onWindowResize?(cb: () => void): void;
}

declare const wx: WxApi | undefined;

class WxStorage implements Storage {
  get(key: string): string | null {
    const value = wx?.getStorageSync(key);
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  set(key: string, value: string): void {
    wx?.setStorageSync(key, value);
  }
  remove(key: string): void {
    wx?.removeStorageSync(key);
  }
}

export interface WxPlatformOptions {
  feedbackEndpoint: string;
  appVersion?: string;
  services?: Partial<PlatformServices>;
}

const pickTouch = (event: WxTouchEvent): WxTouch | undefined =>
  event.touches[0] ?? event.changedTouches[0];

export function createWxPlatform(options: WxPlatformOptions): Platform {
  if (typeof wx === "undefined") throw new Error("wx global missing: not running in WeChat mini game");
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext("2d") as Platform["ctx"];
  const info = wx.getSystemInfoSync();

  const viewport: Viewport = {
    width: info.windowWidth,
    height: info.windowHeight,
    dpr: Math.min(info.pixelRatio || 1, 3),
  };
  canvas.width = Math.round(viewport.width * viewport.dpr);
  canvas.height = Math.round(viewport.height * viewport.dpr);
  (ctx as unknown as CanvasRenderingContext2D).setTransform?.(
    viewport.dpr,
    0,
    0,
    viewport.dpr,
    0,
    0,
  );

  const input = new InputTracker();
  const storage = new WxStorage();

  wx.onTouchStart((event) => {
    const touch = pickTouch(event);
    if (touch) input.downAt(touch.clientX, touch.clientY);
  });
  wx.onTouchMove((event) => {
    const touch = pickTouch(event);
    if (touch) input.move(touch.clientX, touch.clientY);
  });
  wx.onTouchEnd((event) => {
    const touch = pickTouch(event);
    if (touch) input.upAt(touch.clientX, touch.clientY);
  });
  wx.onTouchCancel(() => input.cancel());

  const request =
    canvas.requestAnimationFrame?.bind(canvas) ??
    ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number);
  const cancel = canvas.cancelAnimationFrame?.bind(canvas) ?? ((h: number) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>));

  const services: PlatformServices = {
    auth: options.services?.auth ?? new GuestAuth(storage),
    purchase: options.services?.purchase ?? new UnavailablePurchase(),
    feedback:
      options.services?.feedback ??
      ({
        async submit() {
          // Mini games cannot fetch arbitrary hosts; route through the game's own
          // cloud function or a whitelisted domain, configured at publish time.
          throw new Error("feedback endpoint not configured for WeChat build");
        },
      } as PlatformServices["feedback"]),
    share: options.services?.share ?? new NoopShare(),
  };

  return {
    name: "wx",
    get viewport() {
      return viewport;
    },
    ctx,
    input,
    storage,
    scheduler: rafScheduler(request, cancel),
    services,
    onResize() {
      return () => {};
    },
    destroy() {
      /* mini game runtime has no teardown hook */
    },
  };
}
