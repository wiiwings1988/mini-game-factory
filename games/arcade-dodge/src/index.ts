import { GameLoop, readJson, writeJson } from "@factory/engine";
import type { Platform } from "@factory/platform";
import { createGame, isOnFeedbackButton, resize, update, type GameState } from "./game.js";
import { render } from "./render.js";

export interface MountOptions {
  /** Called when the player taps the in-game 反馈 button; the host owns the form. */
  onFeedbackRequested?: () => void;
}

export interface GameHandle {
  destroy(): void;
  getState(): GameState;
}

const BEST_KEY = "dodge.best";

export function mount(platform: Platform, options: MountOptions = {}): GameHandle {
  const savedBest = readJson<number>(platform.storage, BEST_KEY, 0);
  const viewport = platform.viewport;
  const state = createGame({
    width: viewport.width,
    height: viewport.height,
    best: Number.isFinite(savedBest) ? savedBest : 0,
    seed: `${Date.now()}`,
  });
  let lastBest = state.best;

  const loop = new GameLoop(
    (dt) => {
      const input = platform.input.snapshot();
      if (input.pointer.justDown && isOnFeedbackButton(state, input.pointer.x, input.pointer.y)) {
        options.onFeedbackRequested?.();
      }
      update(state, input, dt);
      platform.input.endFrame();
      if (state.best !== lastBest) {
        lastBest = state.best;
        writeJson(platform.storage, BEST_KEY, state.best);
      }
    },
    () => render(platform.ctx, state),
    platform.scheduler,
  );

  platform.onResize((next) => {
    resize(state, next.width, next.height);
  });

  loop.start();

  return {
    destroy: () => loop.stop(),
    getState: () => state,
  };
}

export { createGame, update, resize, isOnFeedbackButton, feedbackButtonRect } from "./game.js";
export { render } from "./render.js";
export type { GameState, Phase, Block, GameConfig } from "./game.js";
