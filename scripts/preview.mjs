#!/usr/bin/env node
/**
 * Serves dist/web (or a given directory) with the feedback API proxied, so a
 * local play-test exercises the same paths as production.
 *
 *   node scripts/preview.mjs                 # :4173, proxies /api → :8787
 *   node scripts/preview.mjs --port 5000 --dir dist/web --api http://127.0.0.1:8787
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = Number(valueOf("--port") ?? 4173);
const dir = resolve(root, valueOf("--dir") ?? "dist/web");
const api = valueOf("--api") ?? "http://127.0.0.1:8787";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

if (!existsSync(dir)) {
  console.error(`[preview] ${dir} missing — run: node scripts/build.mjs --target web`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const upstream = await fetch(`${api}${url.pathname}${url.search}`, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] ?? "application/json" },
        body: req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req),
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      });
      return res.end(body);
    } catch (error) {
      res.writeHead(502, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: `feedback desk unreachable: ${String(error)}` }));
    }
  }

  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(dir, requested);
  if (!filePath.startsWith(dir)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(dir, "index.html");
  }
  res.writeHead(200, {
    "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  return createReadStream(filePath).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[preview] http://127.0.0.1:${port}  dir=${dir}  api→${api}`);
});

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8") || undefined;
}
