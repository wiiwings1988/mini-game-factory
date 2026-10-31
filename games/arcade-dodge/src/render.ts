import type { Canvas2DLike } from "@factory/engine";
import { feedbackButtonRect, type GameState } from "./game.js";

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

  drawHud(ctx, state);
  drawFeedbackButton(ctx, state);

  if (state.phase === "ready") drawReady(ctx, state);
  if (state.phase === "over") drawOver(ctx, state);

  ctx.restore();
}

function drawHud(ctx: Canvas2DLike, state: GameState): void {
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(state.score), 14, 14);

  ctx.fillStyle = COLORS.dim;
  ctx.font = "500 12px system-ui, -apple-system, sans-serif";
  ctx.fillText(`最高 ${state.best}`, 14, 40);
}

function drawFeedbackButton(ctx: Canvas2DLike, state: GameState): void {
  const rect = feedbackButtonRect(state);
  ctx.fillStyle = "rgba(34,211,238,0.14)";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "rgba(34,211,238,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = COLORS.accent;
  ctx.font = "500 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("反馈", rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
}

function drawReady(ctx: Canvas2DLike, state: GameState): void {
  panel(ctx, state, 150);
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 24px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ARCADE DODGE", state.width / 2, state.height / 2 - 40);

  ctx.fillStyle = COLORS.dim;
  ctx.font = "400 14px system-ui, -apple-system, sans-serif";
  ctx.fillText("按住拖动，躲开落块", state.width / 2, state.height / 2);
  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("点一下开始", state.width / 2, state.height / 2 + 44);
}

function drawOver(ctx: Canvas2DLike, state: GameState): void {
  panel(ctx, state, 170);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.blockEdge;
  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("撞上了", state.width / 2, state.height / 2 - 52);

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(state.score), state.width / 2, state.height / 2 - 8);

  ctx.fillStyle = COLORS.dim;
  ctx.font = "400 13px system-ui, -apple-system, sans-serif";
  ctx.fillText(`最高 ${state.best} · 躲过 ${state.dodged} 块`, state.width / 2, state.height / 2 + 26);

  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("点一下再来一局", state.width / 2, state.height / 2 + 62);
}

function panel(ctx: Canvas2DLike, state: GameState, height: number): void {
  const w = Math.min(state.width - 48, 300);
  const x = (state.width - w) / 2;
  const y = state.height / 2 - height / 2;
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x, y, w, height);
  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, height - 1);
}
