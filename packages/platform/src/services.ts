import type {
  AuthService,
  FeedbackPayload,
  FeedbackReceipt,
  FeedbackService,
  Product,
  PurchaseResult,
  PurchaseService,
  ShareService,
  UserProfile,
} from "./contracts.js";

/**
 * Guest identity: a stable anonymous id kept in platform storage. Store rules
 * on iOS require offering "Sign in with Apple" before any third-party sign in,
 * so guest-first is also the cheapest compliant default.
 */
export class GuestAuth implements AuthService {
  constructor(
    private readonly storage: { get(k: string): string | null; set(k: string, v: string): void },
    private readonly key = "factory.auth.user",
  ) {}

  async current(): Promise<UserProfile> {
    return this.load() ?? this.createGuest();
  }

  async signIn(provider: "wechat" | "apple" | "google" = "google"): Promise<UserProfile> {
    // Real providers are added per platform adapter (see wx.ts / native.ts).
    const existing = this.load();
    const upgraded: UserProfile = {
      id: existing?.id ?? makeId(),
      displayName: existing?.displayName ?? "Player",
      kind: provider,
    };
    this.save(upgraded);
    return upgraded;
  }

  async signOut(): Promise<void> {
    this.storage.set(this.key, "");
  }

  private load(): UserProfile | null {
    const raw = this.storage.get(this.key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as UserProfile;
      return parsed.id ? parsed : null;
    } catch {
      return null;
    }
  }

  private createGuest(): UserProfile {
    const guest: UserProfile = { id: makeId(), displayName: "Guest", kind: "guest" };
    this.save(guest);
    return guest;
  }

  private save(user: UserProfile): void {
    this.storage.set(this.key, JSON.stringify(user));
  }
}

export const makeId = (): string =>
  `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Store purchases are the only compliant path for paid digital goods on iOS/Android. */
export class UnavailablePurchase implements PurchaseService {
  async listProducts(): Promise<Product[]> {
    return [];
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    return { status: "unavailable", productId, reason: "no purchase provider on this platform" };
  }

  async restore(): Promise<PurchaseResult[]> {
    return [];
  }
}

export interface HttpFeedbackOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  appVersion?: string;
}

/** Posts feedback to the feedback desk; failures surface to the caller, never swallowed. */
export class HttpFeedback implements FeedbackService {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpFeedbackOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async submit(payload: FeedbackPayload): Promise<FeedbackReceipt> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    try {
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          appVersion: this.options.appVersion ?? "dev",
          platform: "web",
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`feedback rejected: HTTP ${response.status}`);
      }
      return (await response.json()) as FeedbackReceipt;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class NoopShare implements ShareService {
  async share(): Promise<"shared" | "unsupported"> {
    return "unsupported";
  }
}
