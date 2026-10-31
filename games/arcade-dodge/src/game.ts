/**
 * Arcade Dodge — the factory's reference game.
 *
 * The rule that keeps this file honest: no rendering, no DOM, no timers. It is a
 * pure function of (state, input, dt), so a failing play session can be replayed
 * from its seed and turned into a reproducible issue.
 */
import { Rng, clamp, rectsOverlap, type InputState } from "@factory/engine";

export type Phase = "ready" | "playing" | "over";

export interface Block {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
}

export interface GameConfig {
  playerSize: number;
  playerSpeed: number;
  baseSpawnInterval: number;
  minSpawnInterval: number;
  spawnIntervalDecay: number;
  baseFallSpeed: number;
  fallSpeedGrowth: number;
  maxFallSpeed: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  playerSize: 28,
  playerSpeed: 720,
  baseSpawnInterval: 0.85,
  minSpawnInterval: 0.26,
  spawnIntervalDecay: 0.018,
  baseFallSpeed: 150,
  fallSpeedGrowth: 7.5,
  maxFallSpeed: 620,
};

export interface GameState {
  config: GameConfig;
  phase: Phase;
  width: number;
  height: number;
  playerX: number;
  playerY: number;
  targetX: number;
  blocks: Block[];
  spawnIn: number;
  nextId: number;
  elapsed: number;
  score: number;
  best: number;
  dodged: number;
  shake: number;
  seed: string | number;
  rng: Rng;
  /** Bumped on every phase change so the host can react (sound, haptics, logs). */
  revision: number;
}

export interface CreateOptions {
  width: number;
  height: number;
  best?: number;
  seed?: number | string;
  config?: Partial<GameConfig>;
}

export function createGame(options: CreateOptions): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, ...options.config };
  return {
    config,
    phase: "ready",
    width: options.width,
    height: options.height,
    playerX: options.width / 2,
    playerY: options.height - config.playerSize * 2.4,
    targetX: options.width / 2,
    blocks: [],
    spawnIn: config.baseSpawnInterval,
    nextId: 1,
    elapsed: 0,
    score: 0,
    best: options.best ?? 0,
    dodged: 0,
    shake: 0,
    seed: options.seed ?? 1,
    rng: new Rng(options.seed ?? 1),
    revision: 0,
  };
}

export function resize(state: GameState, width: number, height: number): GameState {
  const scaleX = width / state.width;
  state.width = width;
  state.height = height;
  state.playerY = height - state.config.playerSize * 2.4;
  state.playerX = clamp(state.playerX * scaleX, 0, width);
  state.targetX = clamp(state.targetX * scaleX, 0, width);
  for (const block of state.blocks) block.x *= scaleX;
  return state;
}

export function start(state: GameState): GameState {
  state.phase = "playing";
  state.blocks = [];
  state.elapsed = 0;
  state.score = 0;
  state.dodged = 0;
  state.spawnIn = state.config.baseSpawnInterval;
  state.playerX = state.width / 2;
  state.targetX = state.width / 2;
  state.shake = 0;
  state.revision += 1;
  return state;
}

/**
 * A seed the player has never played. The clock keeps consecutive runs apart; the
 * current rng keeps two restarts inside the same millisecond apart.
 */
function nextSeed(state: GameState): string {
  return `${Date.now()}-${state.width}-${state.rng.int(0, 0x7fffffff)}`;
}

/**
 * Starts a brand new run under a brand new seed.
 *
 * `state.seed` and `state.rng` are always written together: that invariant is what
 * makes the seed in a feedback report replay the run the player actually played.
 * Pass `seed` to pin a run (tests, replays); omit it for a fresh random one.
 */
export function restart(state: GameState, seed?: number | string): GameState {
  const next = seed ?? nextSeed(state);
  state.seed = next;
  state.rng = new Rng(next);
  return start(state);
}

/** Spawn interval shrinks with survival time, never below the floor. */
export function spawnInterval(state: GameState): number {
  const { config } = state;
  return Math.max(
    config.minSpawnInterval,
    config.baseSpawnInterval - state.elapsed * config.spawnIntervalDecay,
  );
}

/** Fall speed grows with survival time, capped. */
export function fallSpeed(state: GameState): number {
  const { config } = state;
  return Math.min(config.maxFallSpeed, config.baseFallSpeed + state.elapsed * config.fallSpeedGrowth);
}

export function update(state: GameState, input: InputState, dt: number): GameState {
  const { config } = state;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 3);

  if (state.phase === "ready") {
    if (input.pointer.justDown && !isOnFeedbackButton(state, input.pointer.x, input.pointer.y)) {
      start(state);
    }
    return state;
  }

  if (state.phase === "over") {
    if (input.pointer.justDown && !isOnFeedbackButton(state, input.pointer.x, input.pointer.y)) {
      restart(state);
    }
    return state;
  }

  state.elapsed += dt;
  // +1e-9: 120 frames of 1/60s accumulate to 1.9999999999999998, and a score of
  // 19 for two seconds of survival is the kind of bug that gets reported.
  state.score = Math.floor(state.elapsed * 10 + 1e-9);

  if (input.pointer.down) {
    state.targetX = clamp(input.pointer.x, config.playerSize / 2, state.width - config.playerSize / 2);
  }
  const distance = state.targetX - state.playerX;
  const maxStep = config.playerSpeed * dt;
  state.playerX += clamp(distance, -maxStep, maxStep);

  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    spawnBlock(state);
    state.spawnIn = spawnInterval(state);
  }

  const playerSize = config.playerSize;
  const px = state.playerX - playerSize / 2;
  const py = state.playerY - playerSize / 2;

  for (const block of state.blocks) {
    block.y += block.speed * dt;
    if (
      rectsOverlap(px, py, playerSize, playerSize, block.x, block.y, block.size, block.size) &&
      state.phase === "playing"
    ) {
      endRun(state);
    }
  }

  const before = state.blocks.length;
  state.blocks = state.blocks.filter((block) => block.y < state.height + block.size);
  state.dodged += before - state.blocks.length;

  return state;
}

function endRun(state: GameState): void {
  state.phase = "over";
  state.best = Math.max(state.best, state.score);
  state.shake = 1;
  state.revision += 1;
}

function spawnBlock(state: GameState): void {
  const size = state.rng.int(22, 34);
  state.blocks.push({
    id: state.nextId++,
    x: state.rng.range(8, Math.max(9, state.width - size - 8)),
    y: -size,
    size,
    speed: fallSpeed(state) * state.rng.range(0.85, 1.18),
  });
}

/** Feedback button lives in the game's own layout so every renderer agrees on it. */
export function feedbackButtonRect(state: GameState): { x: number; y: number; w: number; h: number } {
  const w = 68;
  const h = 26;
  return { x: state.width - w - 12, y: 12, w, h };
}

export function isOnFeedbackButton(state: GameState, x: number, y: number): boolean {
  const r = feedbackButtonRect(state);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
