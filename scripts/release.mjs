#!/usr/bin/env node
/**
 * Release: test → build → freeze a version directory → write release notes.
 *
 * A release is a directory, not a git tag, because publishing (Pages, itch) reads
 * the directory. Tags are an optional convenience on top.
 *
 *   node scripts/release.mjs --notes "修了第二关卡顿"
 *   node scripts/release.mjs --version 0.2.0 --skip-tests
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipTests = args.includes("--skip-tests");
const notes = valueOf("--notes") ?? "";
const explicitVersion = valueOf("--version");

if (!skipTests) {
  console.log("[release] tests");
  run("node", ["node_modules/vitest/vitest.mjs", "run"]);
}

console.log("[release] build");
run("node", ["scripts/build.mjs"]);

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = explicitVersion ?? pkg.version;
const releaseDir = join(root, "releases", version);

if (existsSync(releaseDir)) {
  console.log(`[release] ${releaseDir} exists — overwriting`);
  rmSync(releaseDir, { recursive: true, force: true });
}
mkdirSync(releaseDir, { recursive: true });

for (const target of ["web", "wx"]) {
  const from = join(root, "dist", target);
  if (existsSync(from)) cpSync(from, join(releaseDir, target), { recursive: true });
}

const meta = {
  version,
  releasedAt: new Date().toISOString(),
  notes,
  source: git(["rev-parse", "--short", "HEAD"]) || "unknown",
  dirty: git(["status", "--porcelain"]).length > 0,
  sizes: {
    web: dirSize(join(releaseDir, "web")),
    wx: dirSize(join(releaseDir, "wx")),
  },
};
writeFileSync(join(releaseDir, "release.json"), JSON.stringify(meta, null, 2));
writeFileSync(join(releaseDir, "RELEASE.md"), renderNotes(meta));

const index = join(root, "releases", "index.json");
const list = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : [];
const next = [meta, ...list.filter((entry) => entry.version !== version)].slice(0, 50);
writeFileSync(index, JSON.stringify(next, null, 2));

console.log(`[release] ${version} → ${releaseDir}`);
console.log(`[release] web ${(meta.sizes.web / 1024).toFixed(1)} KB · wx ${(meta.sizes.wx / 1024).toFixed(1)} KB`);
console.log(`[release] next: node scripts/publish.mjs --target local`);

function renderNotes(meta) {
  return [
    `# ${pkg.name} ${meta.version}`,
    "",
    `- 构建时间：${meta.releasedAt}`,
    `- 源码：${meta.source}${meta.dirty ? "（工作区有未提交改动）" : ""}`,
    "",
    "## 本次改动",
    "",
    meta.notes || "（未填写）",
    "",
    "## 产物",
    "",
    `- web：${(meta.sizes.web / 1024).toFixed(1)} KB`,
    `- wx：${(meta.sizes.wx / 1024).toFixed(1)} KB`,
    "",
  ].join("\n");
}

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[release] failed: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

function git(gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { recursive: true })
    .map((entry) => {
      const full = join(dir, entry);
      return statSync(full).isFile() ? statSync(full).size : 0;
    })
    .reduce((a, b) => a + b, 0);
}
