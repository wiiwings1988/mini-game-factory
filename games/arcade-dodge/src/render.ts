import type { Canvas2DLike } from "@factory/engine";
import { HUD_FONTS, estimateTextWidth, feedbackButtonRect, hudLayout, type GameState } from "./game.js";

const COLORS = {
  bg: "#0b1220",
  bgAlt: "#101a2e",
  grid: "rgba(148,163,184,0.12)",
  player: "#38bdf8",
  playerCore: "#e0f2fe",
  block: "#f472b6",
  blockEdge: "#fb7185",
  text: "#e2e8f0",
  dim: "#94a3b8",
  accent: "#22d3ee",
  panel: "rgba(15,23,42,0.86)",
  hudPlate: "rgba(11,18,32,0.92)",
};

export function render(ctx: Canvas2DLike, state: GameState): void {
  const { width, height } = state;
  ctx.save();
  if (state.shake > 0) {
    const amount = state.shake * 6;
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bgAlt;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (const block of state.blocks) {
    ctx.fillStyle = COLORS.block;
    ctx.fillRect(block.x, block.y, block.size, block.size);
    ctx.strokeStyle = COLORS.blockEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(block.x + 1, block.y + 1, block.size - 2, block.size - 2);
  }

  const size = state.config.playerSize;
  const px = state.playerX - size / 2;
  const py = state.playerY - size / 2;
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = COLORS.playerCore;
  ctx.fillRect(px + size * 0.28, py + size * 0.28, size * 0.44, size * 0.44);

  if (state.phase === "ready") drawReady(ctx, state);
  if (state.phase === "over") drawOver(ctx, state);

  // Painted last on purpose: at short canvas heights the ready/over sheet can
  // reach this corner, and the player must still be able to read 最高 and tap 反馈.
  drawFeedbackButton(ctx, state);
  drawHud(ctx, state);

  ctx.restore();
}

function drawHud(ctx: Canvas2DLike, state: GameState): void {
  const layout = hudLayout(state);
  const maxTextWidth = Math.max(0, layout.maxRight - layout.left);

  ctx.fillStyle = COLORS.hudPlate;
  ctx.fillRect(layout.plate.x, layout.plate.y, layout.plate.w, layout.plate.h);

  const score = fitHudText(String(state.score), HUD_FONTS.score, maxTextWidth);
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${score.px}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(score.text, layout.left, layout.scoreTop);

  const best = fitHudText(`最高 ${state.best}`, HUD_FONTS.best, maxTextWidth);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `500 ${best.px}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(best.text, layout.left, layout.bestTop);
}

/** Shrinks the font to the reserved column, then ellipsises rather than reaching the button. */
function fitHudText(text: string, basePx: number, maxWidth: number): { text: string; px: number } {
  const natural = estimateTextWidth(text, basePx);
  if (natural <= maxWidth) return { text, px: basePx };

  const px = Math.max(9, Math.floor((basePx * maxWidth) / natural));
  if (estimateTextWidth("…", px) > maxWidth) return { text: "", px };
  let fitted = text;
  while (estimateTextWidth(`${fitted}…`, px) > maxWidth && fitted.length > 0) {
    fitted = fitted.slice(0, -1);
  }
  return { text: `${fitted}…`, px };
}

function drawFeedbackButton(ctx: Canvas2DLike, state: GameState): void {
  const rect = feedbackButtonRect(state);
  // Border first: the translucent fill then reads as one button, and the HUD is
  // free to paint over the whole corner afterwards without covering the label.
  ctx.strokeStyle = "rgba(34,211,238,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = "rgba(34,211,238,0.14)";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = COLORS.accent;
  ctx.font = "500 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("反馈", rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
}

function drawReady(ctx: Canvas2DLike, state: GameState): void {
  const rect = panel(ctx, state, 150);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 24px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ARCADE DODGE", cx, cy - 40);

  ctx.fillStyle = COLORS.dim;
  ctx.font = "400 14px system-ui, -apple-system, sans-serif";
  ctx.fillText("按住拖动，躲开落块", cx, cy);
  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("点一下开始", cx, cy + 44);
}

function drawOver(ctx: Canvas2DLike, state: GameState): void {
  const rect = panel(ctx, state, 170);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.blockEdge;
  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("撞上了", cx, cy - 52);

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(state.score), cx, cy - 8);

  ctx.fillStyle = COLORS.dim;
  ctx.font = "400 13px system-ui, -apple-system, sans-serif";
  ctx.fillText(`最高 ${state.best} · 躲过 ${state.dodged} 块`, cx, cy + 26);

  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("点一下再来一局", cx, cy + 62);
}

/**
 * The sheet sits in the middle of the canvas, but slides below the HUD band when
 * the canvas is short and it still fits — otherwise a 2-line window would put an
 * opaque panel over 最高. If it cannot fit anywhere, the HUD paints last anyway.
 */
function panel(ctx: Canvas2DLike, state: GameState, height: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(state.width - 48, 300);
  const x = (state.width - w) / 2;
  const layout = hudLayout(state);
  const belowHud = layout.plate.y + layout.plate.h + 10;
  const centered = (state.height - height) / 2;
  const y = belowHud + height <= state.height - 8 ? Math.max(centered, belowHud) : centered;
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x, y, w, height);
  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, height - 1);
  return { x, y, w, h: height };
}
