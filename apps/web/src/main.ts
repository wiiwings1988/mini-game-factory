import { createWebPlatform } from "@factory/platform";
import { mount } from "@factory/games/arcade-dodge";
import { bootChatwoot, readChatwootConfig } from "./chatwoot";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("#game canvas missing");

const dialog = document.getElementById("feedback") as HTMLDialogElement;
const form = document.getElementById("feedback-form") as HTMLFormElement;
const status = document.getElementById("feedback-status") as HTMLParagraphElement;

const platform = createWebPlatform({
  canvas,
  feedbackEndpoint: import.meta.env.VITE_FEEDBACK_ENDPOINT ?? "/api/feedback",
  appVersion: __APP_VERSION__,
});

// 配了 Chatwoot 就走真 help desk（能回话、玩家能看到进度）；
// 没配就退回页面内的简化表单，本地开发和烟测不依赖外部服务。
const chatwootConfig = readChatwootConfig(import.meta.env as unknown as Record<string, string | undefined>);
const chatwoot = chatwootConfig ? bootChatwoot(chatwootConfig) : null;

function buildContext(): Record<string, unknown> {
  const state = handle.getState();
  return {
    score: state.score,
    best: state.best,
    phase: state.phase,
    seed: state.seed,
    elapsed: Number(state.elapsed.toFixed(2)),
    viewport: `${platform.viewport.width}x${platform.viewport.height}`,
    appVersion: __APP_VERSION__,
  };
}

const handle = mount(platform, {
  onFeedbackRequested: () => {
    if (chatwoot) {
      chatwoot.setContext(buildContext());
      chatwoot.open();
      return;
    }
    status.textContent = "";
    status.className = "status";
    form.reset();
    dialog.showModal();
  },
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const kind = (data.get("kind") as "bug" | "idea" | "other") ?? "other";
  const message = String(data.get("message") ?? "").trim();
  const contact = String(data.get("contact") ?? "").trim();
  if (message.length === 0) {
    status.textContent = "写一句话再发。";
    status.className = "status err";
    return;
  }

  const state = handle.getState();
  status.textContent = "发送中…";
  status.className = "status";

  try {
    const receipt = await platform.services.feedback.submit({
      kind,
      message,
      ...(contact ? { contact } : {}),
      context: buildContext(),
    });
    status.textContent = `收到了，编号 ${receipt.id}`;
    status.className = "status ok";
    setTimeout(() => dialog.close(), 900);
  } catch (error) {
    status.textContent = `没发出去：${(error as Error).message}`;
    status.className = "status err";
  }
});

// Test hook: e2e checks read state from here instead of guessing from pixels.
(globalThis as Record<string, unknown>).__dodge = {
  state: () => handle.getState(),
  platform,
};
