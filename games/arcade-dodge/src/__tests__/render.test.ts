import { describe, expect, it } from "vitest";
import type { Canvas2DLike } from "@factory/engine";
import { createGame, feedbackButtonRect, hudLayout, type GameState } from "../game.js";
import { render } from "../render.js";

/**
 * These tests guard the top-left HUD corner: the 最高 N label and the 反馈 button
 * live in it, and a player must be able to read the label at every canvas size.
 * (Feedback fb_ae219e6a / CANO-14 reported the button covering the label.)
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Paint {
  op: "fillRect" | "strokeRect" | "fillText";
  index: number;
  style: string;
  font: string;
  text?: string;
  rect: Rect;
}

/** Records draw calls in order, with the style in effect, so z-order is assertable. */
class PaintLog implements Canvas2DLike {
  fillStyle = "#000";
  strokeStyle = "#000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: "left" | "center" | "right" = "left";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" = "alphabetic";
  globalAlpha = 1;

  readonly paints: Paint[] = [];

  private push(paint: Omit<Paint, "index" | "style" | "font">): void {
    this.paints.push({ ...paint, index: this.paints.length, style: String(this.fillStyle), font: this.font });
  }

  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  clearRect(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  closePath(): void {}
  fill(): void {}
  stroke(): void {}

  fillRect(x: number, y: number, w: number, h: number): void {
    this.push({ op: "fillRect", rect: { x, y, w, h } });
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.push({ op: "strokeRect", rect: { x, y, w, h } });
  }
  fillText(text: string, x: number, y: number): void {
    const w = estimateTextWidth(String(text), this.font);
    const ascent = fontPx(this.font) * 0.8;
    const top = this.textBaseline === "top" ? y : this.textBaseline === "middle" ? y - ascent / 2 : y - ascent;
    const left = this.textAlign === "center" ? x - w / 2 : this.textAlign === "right" ? x - w : x;
    this.push({ op: "fillText", text: String(text), rect: { x: left, y: top, w, h: ascent } });
  }
}

/** Upper-bound width estimate: CJK ≈ 1em, digits/space ≈ 0.62em. Good enough to catch collisions. */
function estimateTextWidth(text: string, font: string): number {
  const px = fontPx(font);
  let width = 0;
  for (const char of text) {
    width += /[\u3000-\u9fff]/.test(char) ? px : px * 0.62;
  }
  return width;
}

function fontPx(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : 10;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const asRect = (r: { x: number; y: number; w: number; h: number }): Rect => ({ ...r });

/** Parses the alpha out of a CSS colour; opaque fills are the ones that can hide text. */
function alphaOf(style: string): number {
  const rgba = /rgba?\(([^)]+)\)/.exec(style);
  if (rgba) {
    const parts = rgba[1]!.split(",").map((p) => Number(p.trim()));
    return parts.length >= 4 ? parts[3]! : 1;
  }
  return 1; // #rrggbb / named colours
}

function paint(width: number, height: number, best = 8): { state: GameState; log: PaintLog } {
  const state = createGame({ width, height, best, seed: 1 });
  const log = new PaintLog();
  render(log, state);
  return { state, log };
}

const findText = (log: PaintLog, prefix: string): Paint => {
  const found = log.paints.find((p) => p.op === "fillText" && (p.text ?? "").startsWith(prefix));
  if (!found) throw new Error(`no text painted starting with ${prefix}`);
  return found;
};

const buttonPaint = (log: PaintLog, state: GameState): Paint => {
  const rect = feedbackButtonRect(state);
  const found = log.paints.find(
    (p) =>
      p.op === "fillRect" &&
      p.rect.x === rect.x &&
      p.rect.y === rect.y &&
      p.rect.w === rect.w &&
      p.rect.h === rect.h,
  );
  if (!found) throw new Error("feedback button was never painted");
  return found;
};

/** Anything opaque drawn *after* `paint` that overlaps it renders on top of it. */
const paintedOver = (log: PaintLog, target: Paint): Paint[] =>
  log.paints.filter(
    (p) => p.index > target.index && p.op !== "fillText" && intersects(p.rect, target.rect),
  );

const VIEWPORTS: Array<[number, number]> = [
  [320, 568],
  [390, 844],
  [520, 900],
];

/** Short windows: the ready/over panel slides up into the HUD corner. */
const SHORT_VIEWPORTS: Array<[number, number]> = [
  [320, 200],
  [390, 250],
  [520, 200],
];

describe("arcade-dodge HUD corner", () => {
  it.each(VIEWPORTS)("keeps 最高 clear of the 反馈 button at %ix%i", (width, height) => {
    const { state, log } = paint(width, height);
    const best = findText(log, "最高");
    const button = asRect(feedbackButtonRect(state));

    expect(intersects(best.rect, button)).toBe(false);
    expect(best.rect.x + best.rect.w).toBeLessThanOrEqual(hudLayout(state).maxRight);
    expect(best.rect.x + best.rect.w).toBeLessThanOrEqual(width);
  });

  it.each(VIEWPORTS)("never lets a 4-digit best reach the button at %ix%i", (width, height) => {
    const { state, log } = paint(width, height, 9999);
    const best = findText(log, "最高");
    expect(intersects(best.rect, asRect(feedbackButtonRect(state)))).toBe(false);
    expect(hudLayout(state).maxRight).toBeLessThanOrEqual(feedbackButtonRect(state).x - 1);
  });

  it.each([...VIEWPORTS, ...SHORT_VIEWPORTS])("paints nothing over 最高 at %ix%i", (width, height) => {
    const { log } = paint(width, height);
    expect(paintedOver(log, findText(log, "最高"))).toEqual([]);
  });

  it.each([...VIEWPORTS, ...SHORT_VIEWPORTS])("paints nothing over the 反馈 button at %ix%i", (width, height) => {
    const { state, log } = paint(width, height);
    expect(paintedOver(log, buttonPaint(log, state))).toEqual([]);
  });

  it.each(VIEWPORTS)("puts an opaque plate behind the HUD text at %ix%i", (width, height) => {
    const { log } = paint(width, height);
    const score = findText(log, "0");
    const best = findText(log, "最高");
    const plate = log.paints.find(
      (p) =>
        p.op === "fillRect" &&
        p.index < score.index &&
        alphaOf(p.style) >= 0.5 &&
        intersects(p.rect, score.rect) &&
        intersects(p.rect, best.rect) &&
        p.rect.w < width / 2,
    );
    expect(plate, "HUD text must sit on its own plate, not straight over the grid").toBeDefined();
  });
});

describe("arcade-dodge HUD layout", () => {
  it("reserves the feedback button's column instead of hard-coding a width", () => {
    for (const width of [240, 320, 390, 520]) {
      const state = createGame({ width, height: 640, seed: 1 });
      const layout = hudLayout(state);
      expect(layout.maxRight).toBeLessThanOrEqual(feedbackButtonRect(state).x);
      expect(layout.maxRight).toBeGreaterThan(layout.left);
      expect(layout.plate.w).toBeGreaterThan(0);
      expect(layout.plate.x + layout.plate.w).toBeLessThanOrEqual(feedbackButtonRect(state).x);
    }
  });

  it("keeps the plate inside the canvas at very narrow widths", () => {
    const state = createGame({ width: 60, height: 320, seed: 1 });
    const layout = hudLayout(state);
    expect(layout.plate.w).toBeGreaterThanOrEqual(0);
    expect(layout.plate.x + layout.plate.w).toBeLessThanOrEqual(state.width);
  });
});
