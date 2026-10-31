/**
 * Platform contracts: what the game is allowed to ask of the host.
 *
 * Everything the game needs that differs between browser, WeChat mini game and
 * a native shell (iOS/Android via Capacitor) enters through here, so a new
 * target means one new adapter instead of a fork of the game.
 */
import type { Canvas2DLike, FrameScheduler, InputTracker, Storage } from "@factory/engine";

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface UserProfile {
  readonly id: string;
  readonly displayName: string;
  readonly kind: "guest" | "web" | "wechat" | "apple" | "google";
}

export interface AuthService {
  /** Returns the current user, creating a guest identity if needed. */
  current(): Promise<UserProfile>;
  /** Platform-native sign in; guests upgrade in place and keep their progress. */
  signIn(provider?: "wechat" | "apple" | "google"): Promise<UserProfile>;
  signOut(): Promise<void>;
}

export interface Product {
  readonly id: string;
  readonly title: string;
  readonly priceLabel: string;
}

export interface PurchaseResult {
  readonly status: "purchased" | "cancelled" | "unavailable" | "failed";
  readonly productId: string;
  readonly receipt?: string;
  readonly reason?: string;
}

export interface PurchaseService {
  listProducts(): Promise<Product[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult[]>;
}

export interface FeedbackPayload {
  readonly kind: "bug" | "idea" | "other";
  readonly message: string;
  readonly contact?: string;
  readonly rating?: number;
  readonly context?: Record<string, unknown>;
}

export interface FeedbackReceipt {
  readonly id: string;
  readonly createdAt: string;
}

export interface FeedbackService {
  submit(payload: FeedbackPayload): Promise<FeedbackReceipt>;
}

export interface ShareService {
  share(payload: { title: string; text?: string; url?: string }): Promise<"shared" | "unsupported">;
}

export interface PlatformServices {
  readonly auth: AuthService;
  readonly purchase: PurchaseService;
  readonly feedback: FeedbackService;
  readonly share: ShareService;
}

export interface Platform {
  readonly name: "web" | "wx" | "headless" | "native";
  readonly viewport: Viewport;
  readonly ctx: Canvas2DLike;
  readonly input: InputTracker;
  readonly storage: Storage;
  readonly scheduler: FrameScheduler;
  readonly services: PlatformServices;
  /** Called whenever the host viewport changes (resize, rotation, safe area). */
  onResize(handler: (viewport: Viewport) => void): () => void;
  destroy(): void;
}
