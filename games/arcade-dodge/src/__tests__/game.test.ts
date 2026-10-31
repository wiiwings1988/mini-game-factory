import { describe, expect, it } from "vitest";
import type { InputState, PointerState } from "@factory/engine";
import {
  createGame,
  feedbackButtonRect,
  isOnFeedbackButton,
  resize,
  start,
  update,
  type GameState,
} from "../game.js";

const pointer = (over: Partial<PointerState> = {}): PointerState => ({
  x: 0,
  y: 0,
  down: false,
  justDown: false,
  justUp: false,
  ...over,
});

const input = (over: Partial<PointerState> = {}): InputState => ({
  pointer: pointer(over),
  frame: 0,
});

const step = (state: GameState, dt: number, over: Partial<PointerState> = {}): void => {
  update(state, input(over), dt);
};

describe("arcade-dodge rules", () => {
  it("starts ready with the player near the floor", () => {
    const state = createGame({ width: 360, height: 640, seed: 1 });
    expect(state.phase).toBe("ready");
    expect(state.playerX).toBe(180);
    expect(state.playerY).toBeGreaterThan(500);
    expect(state.blocks).toHaveLength(0);
  });

  it("starts a run on an ordinary tap", () => {
    const state = createGame({ width: 360, height: 640, seed: 1 });
    step(state, 1 / 60, { x: 100, y: 400, justDown: true, down: true });
    expect(state.phase).toBe("playing");
  });

  it("does not start a run when the tap lands on the feedback button", () => {
    const state = createGame({ width: 360, height: 640, seed: 1 });
    const button = feedbackButtonRect(state);
    step(state, 1 / 60, { x: button.x + 4, y: button.y + 4, justDown: true, down: true });
    expect(state.phase).toBe("ready");
    expect(isOnFeedbackButton(state, button.x + 4, button.y + 4)).toBe(true);
  });

  it("spawns blocks as the run goes on and moves them downwards", () => {
    const state = start(createGame({ width: 360, height: 640, seed: 3 }));
    for (let i = 0; i < 90; i += 1) step(state, 1 / 60);
    expect(state.blocks.length).toBeGreaterThan(0);
    const first = state.blocks[0]!;
    const y = first.y;
    step(state, 1 / 60);
    expect(first.y).toBeGreaterThan(y);
  });

  it("scores by survival time", () => {
    const state = start(createGame({ width: 360, height: 640, seed: 5 }));
    for (let i = 0; i < 120; i += 1) step(state, 1 / 60);
    expect(state.score).toBe(20);
  });

  it("ends the run on contact and records the best score", () => {
    const state = start(createGame({ width: 360, height: 640, seed: 5, best: 0 }));
    for (let i = 0; i < 120; i += 1) step(state, 1 / 60);
    state.blocks.push({
      id: 999,
      x: state.playerX - 10,
      y: state.playerY - 10,
      size: 30,
      speed: 0,
    });
    step(state, 1 / 60);
    expect(state.phase).toBe("over");
    expect(state.best).toBe(20);
    expect(state.shake).toBeGreaterThan(0);
  });

  it("restarts on tap after crashing", () => {
    const state = start(createGame({ width: 360, height: 640, seed: 5 }));
    state.phase = "over";
    step(state, 1 / 60, { x: 120, y: 300, justDown: true, down: true });
    expect(state.phase).toBe("playing");
    expect(state.score).toBe(0);
  });

  it("moves the player toward a held pointer but never past it", () => {
    const state = start(createGame({ width: 360, height: 640, seed: 5 }));
    step(state, 1 / 60, { x: 320, y: 500, down: true });
    const afterOneFrame = state.playerX;
    expect(afterOneFrame).toBeGreaterThan(180);
    for (let i = 0; i < 200; i += 1) step(state, 1 / 60, { x: 320, y: 500, down: true });
    expect(state.playerX).toBeCloseTo(320 - 0, 0);
  });

  it("keeps blocks and player inside the canvas after a resize", () => {
    const state = start(createGame({ width: 360, height: 640, seed: 5 }));
    state.blocks.push({ id: 1, x: 300, y: 10, size: 24, speed: 100 });
    resize(state, 720, 1280);
    expect(state.blocks[0]!.x).toBe(600);
    expect(state.playerY).toBeCloseTo(1280 - 28 * 2.4, 5);
  });

  it("replays identically from the same seed", () => {
    const run = (seed: string): number[] => {
      const state = start(createGame({ width: 360, height: 640, seed }));
      for (let i = 0; i < 240; i += 1) step(state, 1 / 60, { x: 200, y: 500, down: true });
      return state.blocks.map((b) => Math.round(b.x * 100) + Math.round(b.y * 100));
    };
    expect(run("seed-a")).toEqual(run("seed-a"));
    expect(run("seed-a")).not.toEqual(run("seed-b"));
  });
});
