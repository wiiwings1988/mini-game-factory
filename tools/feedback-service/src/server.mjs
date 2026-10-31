#!/usr/bin/env node
/**
 * Feedback desk — the front door for player feedback.
 *
 * Contract with the rest of the factory:
 *   POST /api/feedback          players submit (public)
 *   GET  /api/feedback          agents/people read the queue
 *   GET  /api/feedback/:id/draft  ready-made Multica issue draft
 *   PATCH /api/feedback/:id     write back the issue key / status
 *   GET  /api/stats             counts per status
 *   GET  /                      human inbox (read + triage)
 *
 * On every new row it optionally fires FEEDBACK_WEBHOOK_URL so an autopilot can
 * wake immediately instead of waiting for the next poll.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  STATUSES,
  addFeedback,
  eventsFor,
  getFeedback,
  listFeedback,
  openDb,
  stats,
  toIssueDraft,
  updateFeedback,
} from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.FEEDBACK_DB ?? join(here, "..", "data", "feedback.db");
const TOKEN = process.env.FEEDBACK_TOKEN ?? "";
const WEBHOOK_URL = process.env.FEEDBACK_WEBHOOK_URL ?? "";
const MAX_BODY = 64 * 1024;

const db = openDb(DB_PATH);
const inboxHtml = readFileSync(join(here, "..", "public", "index.html"), "utf8");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") return send(res, 204, null, { "access-control-allow-origin": "*" });

  try {
    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, service: "feedback-desk", stats: stats(db) });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(res, 200, inboxHtml, { "content-type": "text/html; charset=utf-8" });
    }

    if (url.pathname === "/api/feedback" && req.method === "POST") {
      const body = await readJson(req);
      const error = validate(body);
      if (error) return json(res, 400, { error });
      const feedback = addFeedback(db, body);
      void fireWebhook(feedback);
      return json(res, 201, { id: feedback.id, createdAt: feedback.createdAt });
    }

    requireAdmin(req);

    if (url.pathname === "/api/feedback" && req.method === "GET") {
      return json(res, 200, {
        items: listFeedback(db, {
          status: url.searchParams.get("status") ?? undefined,
          since: url.searchParams.get("since") ?? undefined,
          limit: url.searchParams.get("limit") ?? 50,
        }),
        statuses: STATUSES,
      });
    }

    if (url.pathname === "/api/stats") {
      return json(res, 200, stats(db));
    }

    const draftMatch = url.pathname.match(/^\/api\/feedback\/([^/]+)\/draft$/);
    if (draftMatch && req.method === "GET") {
      const feedback = getFeedback(db, draftMatch[1]);
      if (!feedback) return json(res, 404, { error: "not found" });
      return json(res, 200, toIssueDraft(feedback));
    }

    const itemMatch = url.pathname.match(/^\/api\/feedback\/([^/]+)$/);
    if (itemMatch && req.method === "GET") {
      const feedback = getFeedback(db, itemMatch[1]);
      if (!feedback) return json(res, 404, { error: "not found" });
      return json(res, 200, { ...feedback, events: eventsFor(db, feedback.id) });
    }
    if (itemMatch && req.method === "PATCH") {
      const patch = await readJson(req);
      const updated = updateFeedback(db, itemMatch[1], patch);
      if (!updated) return json(res, 404, { error: "not found" });
      return json(res, 200, updated);
    }

    return json(res, 404, { error: "no route" });
  } catch (error) {
    const status = error?.statusCode ?? 500;
    return json(res, status, { error: (error?.message ?? "internal error").toString() });
  }
});

async function fireWebhook(feedback) {
  if (!WEBHOOK_URL) return;
  const body = JSON.stringify({
    event: "feedback.created",
    feedback,
    draft: toIssueDraft(feedback),
  });
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    // Never lose the feedback because the notification path is down.
    db.prepare("INSERT INTO events (feedback_id, at, type, payload) VALUES (?, ?, ?, ?)").run(
      feedback.id,
      new Date().toISOString(),
      "webhook_failed",
      JSON.stringify({ url: WEBHOOK_URL, error: String(error) }),
    );
    console.error(`[feedback] webhook failed: ${error}`);
  }
}

function requireAdmin(req) {
  if (!TOKEN) return;
  const header = req.headers.authorization ?? "";
  if (header !== `Bearer ${TOKEN}`) {
    const error = new Error("unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function validate(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  if (!["bug", "idea", "other"].includes(body.kind)) return "kind must be bug|idea|other";
  if (typeof body.message !== "string") return "message is required";
  const message = body.message.trim();
  if (message.length < 2) return "message is too short";
  if (message.length > 2000) return "message is too long (max 2000)";
  return null;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error("payload too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function json(res, status, payload) {
  return send(res, status, JSON.stringify(payload), {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  if (body === null) return res.end();
  return res.end(body);
}

server.listen(PORT, HOST, () => {
  console.log(`[feedback] desk on http://${HOST}:${PORT}  db=${DB_PATH}`);
  console.log(`[feedback] webhook=${WEBHOOK_URL ? WEBHOOK_URL.replace(/token=[^&]+/, "token=***") : "(off)"}`);
});
