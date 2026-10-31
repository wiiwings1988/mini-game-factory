import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const STATUSES = ["new", "triaged", "issue_created", "fixed", "published", "wontfix"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  contact TEXT,
  rating INTEGER,
  context TEXT,
  app_version TEXT,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  issue_key TEXT,
  issue_url TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id TEXT NOT NULL,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT
);
`;

export function openDb(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

const now = () => new Date().toISOString();

export function addFeedback(db, payload) {
  const id = `fb_${randomUUID().slice(0, 8)}`;
  const row = {
    id,
    created_at: now(),
    kind: payload.kind,
    message: payload.message,
    contact: payload.contact ?? null,
    rating: payload.rating ?? null,
    context: payload.context ? JSON.stringify(payload.context) : null,
    app_version: payload.appVersion ?? null,
    platform: payload.platform ?? null,
    status: "new",
    issue_key: null,
    issue_url: null,
    note: null,
  };
  db.prepare(
    `INSERT INTO feedback (id, created_at, kind, message, contact, rating, context, app_version, platform, status, issue_key, issue_url, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.created_at,
    row.kind,
    row.message,
    row.contact,
    row.rating,
    row.context,
    row.app_version,
    row.platform,
    row.status,
    row.issue_key,
    row.issue_url,
    row.note,
  );
  db.prepare("INSERT INTO events (feedback_id, at, type, payload) VALUES (?, ?, ?, ?)").run(
    id,
    row.created_at,
    "created",
    JSON.stringify({ kind: row.kind }),
  );
  return toFeedback(db.prepare("SELECT * FROM feedback WHERE id = ?").get(id));
}

export function listFeedback(db, { status, limit = 50, since } = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (since) {
    clauses.push("created_at >= ?");
    params.push(since);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM feedback ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, Math.min(Number(limit) || 50, 500));
  return rows.map(toFeedback);
}

export function getFeedback(db, id) {
  const row = db.prepare("SELECT * FROM feedback WHERE id = ?").get(id);
  return row ? toFeedback(row) : null;
}

export function updateFeedback(db, id, patch) {
  const current = db.prepare("SELECT * FROM feedback WHERE id = ?").get(id);
  if (!current) return null;

  const next = {
    status: patch.status ?? current.status,
    issue_key: patch.issueKey ?? current.issue_key,
    issue_url: patch.issueUrl ?? current.issue_url,
    note: patch.note ?? current.note,
  };
  if (patch.status && !STATUSES.includes(patch.status)) {
    throw new Error(`unknown status: ${patch.status}`);
  }
  db.prepare("UPDATE feedback SET status = ?, issue_key = ?, issue_url = ?, note = ? WHERE id = ?").run(
    next.status,
    next.issue_key,
    next.issue_url,
    next.note,
    id,
  );
  db.prepare("INSERT INTO events (feedback_id, at, type, payload) VALUES (?, ?, ?, ?)").run(
    id,
    now(),
    "updated",
    JSON.stringify(patch),
  );
  return toFeedback(db.prepare("SELECT * FROM feedback WHERE id = ?").get(id));
}

export function stats(db) {
  const rows = db.prepare("SELECT status, COUNT(*) AS count FROM feedback GROUP BY status").all();
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { total, byStatus };
}

export function eventsFor(db, id) {
  return db.prepare("SELECT * FROM events WHERE feedback_id = ? ORDER BY id").all(id);
}

function toFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    message: row.message,
    contact: row.contact,
    rating: row.rating === null ? null : Number(row.rating),
    context: row.context ? JSON.parse(row.context) : null,
    appVersion: row.app_version,
    platform: row.platform,
    status: row.status,
    issueKey: row.issue_key,
    issueUrl: row.issue_url,
    note: row.note,
  };
}

/**
 * Turns one feedback row into a Multica-ready issue draft. The agent still owns
 * dedupe and classification; this only removes the copy-paste work.
 */
export function toIssueDraft(feedback) {
  const title = `${labelFor(feedback.kind)}：${firstLine(feedback.message, 48)}`;
  const lines = [
    "## 玩家原话",
    "",
    `> ${feedback.message.replace(/\n/g, "\n> ")}`,
    "",
    "## 事实",
    "",
    `- 反馈编号：\`${feedback.id}\``,
    `- 类型：${feedback.kind}`,
    `- 收到时间：${feedback.createdAt}`,
    `- 客户端：${feedback.appVersion ?? "unknown"} / ${feedback.platform ?? "unknown"}`,
    `- 联系方式：${feedback.contact ?? "未留"}`,
  ];
  if (feedback.context && Object.keys(feedback.context).length > 0) {
    lines.push("", "## 游戏内状态", "", "```json", JSON.stringify(feedback.context, null, 2), "```");
  }
  lines.push("", "## 验收", "", "- [ ] 复现路径写进 issue 评论", "- [ ] 修复后版本号写回本 issue", "");
  return { title, body: lines.join("\n") };
}

const labelFor = (kind) => (kind === "bug" ? "【Bug】" : kind === "idea" ? "【建议】" : "【反馈】");

const firstLine = (text, max) => {
  const line = text.split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
};
