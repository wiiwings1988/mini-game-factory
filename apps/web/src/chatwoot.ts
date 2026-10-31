/**
 * Chatwoot 网站 widget 的接线层。
 *
 * 为什么走 widget 而不是让游戏页直接调 API：Chatwoot 的 API 要带
 * 管理员 token，静态页面里不能存。widget 用的是「网站收件箱」的公开
 * token，天生给浏览器用。
 *
 * 没配环境变量时返回 null —— 本地开发、CI、烟测都自动退回页面内的
 * 简化表单，不依赖外部服务。
 */

type ChatwootSdk = { run: (opts: { websiteToken: string; baseUrl: string }) => void };
type ChatwootApi = {
  toggle: (state?: "open" | "close") => void;
  setCustomAttributes: (attrs: Record<string, unknown>) => void;
  setUser?: (id: string, hash?: string) => void;
};

type GlobalWithChatwoot = {
  chatwootSDK?: ChatwootSdk;
  $chatwoot?: ChatwootApi;
  chatwootSettings?: Record<string, unknown>;
};

export type ChatwootHandle = {
  open: () => void;
  setContext: (context: Record<string, unknown>) => void;
};

export type ChatwootConfig = {
  baseUrl: string;
  websiteToken: string;
};

function globals(): GlobalWithChatwoot {
  return globalThis as unknown as GlobalWithChatwoot;
}

/** 从构建期环境变量里取配置；缺一个就不启用。 */
export function readChatwootConfig(env: Record<string, string | undefined>): ChatwootConfig | null {
  const baseUrl = env.VITE_CHATWOOT_BASE_URL?.trim();
  const websiteToken = env.VITE_CHATWOOT_WEBSITE_TOKEN?.trim();
  if (!baseUrl || !websiteToken) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), websiteToken };
}

export function bootChatwoot(config: ChatwootConfig, document_: Document = document): ChatwootHandle | null {
  const g = globals();
  if (!g.chatwootSDK) {
    const script = document_.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `${config.baseUrl}/packs/js/sdk.js`;
    script.addEventListener("load", () => {
      g.chatwootSDK?.run({ websiteToken: config.websiteToken, baseUrl: config.baseUrl });
    });
    document_.head.appendChild(script);
    g.chatwootSettings = { position: "right", locale: "zh_CN", type: "standard" };
  }

  return {
    open: () => g.$chatwoot?.toggle("open"),
    setContext: (context) => g.$chatwoot?.setCustomAttributes(context),
  };
}
