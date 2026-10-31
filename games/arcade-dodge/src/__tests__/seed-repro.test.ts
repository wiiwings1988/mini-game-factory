/**
 * The feedback form reports `state.seed`, so that value has to be the seed the live
 * run is actually playing: a restart that reseeds the rng but not `state.seed` ships
 * a report nobody can replay. These cases drive the rules layer only — no DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng, type InputState } from "@factory/engine";
import { createGame, restart, start, update, type GameState } from "../game.js";

const WIDTH = 390;
const HEIGHT = 844;

const idle = (frame: number): InputState => ({
  pointer: { x: 0, y: 0, down: false, justDown: false, justUp: false },
  frame,
});

const step = (state: GameState, frame = 0): void => {
  update(state, idle(frame), 1 / 60);
};

/** Plays a run and returns where every block was, i.e. what a replay must reproduce. */
const play = (state: GameState, frames = 90): number[] => {
  for (let frame = 0; frame < frames; frame += 1) step(state, frame);
  return state.blocks.map((block) => Math.round(block.x));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("restart keeps the reported seed replayable", () => {
  it("replays a restarted run block for block from its reported seed", () => {
    const live = start(createGame({ width: WIDTH, height: HEIGHT, seed: "session-A" }));
    play(live);
    live.phase = "over";
    restart(live, "run-2");
    play(live);
    live.phase = "over";
    restart(live, "run-3");
    const reported = play(live);

    // Exactly what the web feedback form sends, replayed through the same rules.
    const replay = start(createGame({ width: WIDTH, height: HEIGHT, seed: live.seed }));
    expect(play(replay)).toEqual(reported);
    expect(live.seed).toBe("run-3");
    expect(reported.length).toBeGreaterThan(0);
  });

  it("moves state.seed together with the rng on a fresh restart", () => {
    const live = start(createGame({ width: WIDTH, height: HEIGHT, seed: "session-A" }));
    const firstSeed = live.seed;
    play(live);

    live.phase = "over";
    restart(live);

    expect(live.seed).not.toBe(firstSeed);
    // The rng really is seeded with the reported value, not with some private one.
    expect(live.rng.next()).toBe(new Rng(live.seed).next());
  });

  it("gives two restarts in the same millisecond different runs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const live = start(createGame({ width: WIDTH, height: HEIGHT, seed: "session-A" }));
    live.phase = "over";
    restart(live);
    const firstSeed = live.seed;
    live.phase = "over";
    restart(live);

    expect(live.seed).not.toBe(firstSeed);
    expect(new Rng(live.seed).next()).not.toBe(new Rng(firstSeed).next());
  });
});
