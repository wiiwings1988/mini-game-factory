import { describe, expect, it } from "vitest";
import { GameLoop, manualScheduler } from "../loop.js";

describe("GameLoop", () => {
  it("runs fixed steps and renders once per advance", () => {
    let updates = 0;
    let renders = 0;
    const loop = new GameLoop(
      () => {
        updates += 1;
      },
      () => {
        renders += 1;
      },
      manualScheduler(),
    );

    loop.advance(1 / 30);
    expect(updates).toBe(2);
    expect(renders).toBe(1);
  });

  it("clamps huge frame deltas instead of spiralling", () => {
    let updates = 0;
    const loop = new GameLoop(
      () => {
        updates += 1;
      },
      () => {},
      manualScheduler(),
      { maxStepsPerFrame: 5, maxFrameTime: 0.25 },
    );
    loop.advance(10);
    expect(updates).toBe(5);
  });

  it("tracks elapsed simulated time", () => {
    const loop = new GameLoop(
      () => {},
      () => {},
      manualScheduler(),
    );
    for (let i = 0; i < 60; i += 1) loop.advance(1 / 60);
    expect(loop.elapsed).toBeCloseTo(1, 5);
  });

  it("does not schedule frames before start()", () => {
    let requested = 0;
    const scheduler = { request: () => { requested += 1; return 1; }, cancel: () => {}, now: () => 0 };
    const loop = new GameLoop(
      () => {},
      () => {},
      scheduler,
    );
    loop.advance(1 / 60);
    expect(requested).toBe(0);
  });
});
