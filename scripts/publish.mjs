#!/usr/bin/env node
/**
 * Publish a frozen release. Three targets, one contract: publish either fully
 * succeeds or exits non-zero with the reason — never "probably fine".
 *
 *   node scripts/publish.mjs --target local
 *   node scripts/publish.mjs --target gh-pages            # needs a git remote
 *   node scripts/publish.mjs --target itch --butler ...   # needs butler CLI
 *
 * `local` copies web+wx into public/<version>/ and points public/latest at it,
 * which is exactly what a plain static server (or GitHub Pages) serves.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const target = valueOf("--target") ?? "local";
const version = valueOf("--version") ?? readLatestVersion();

if (!version) {
  console.error("[publish] no release found — run: node scripts/release.mjs");
  process.exit(1);
}

const releaseDir = join(root, "releases", version);
if (!existsSync(releaseDir)) {
  console.error(`[publish] releases/${version} missing`);
  process.exit(1);
}

const meta = JSON.parse(readFileSync(join(releaseDir, "release.json"), "utf8"));

switch (target) {
  case "local":
    publishLocal();
    break;
  case "gh-pages":
    publishGhPages();
    break;
  case "itch":
    publishItch();
    break;
  default:
    console.error(`[publish] unknown target: ${target}`);
    process.exit(2);
}

console.log(`[publish] ${version} → ${target} ok`);

function publishLocal() {
  const publicDir = join(root, "public");
  mkdirSync(publicDir, { recursive: true });
  const dest = join(publicDir, version);
  rmSync(dest, { recursive: true, force: true });
  cpSync(releaseDir, dest, { recursive: true });

  const latest = join(publicDir, "latest");
  rmSync(latest, { recursive: true, force: true });
  try {
    symlinkSync(version, latest, "dir");
  } catch {
    cpSync(dest, latest, { recursive: true });
  }

  writeFileSync(
    join(publicDir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>${meta.version}</title>
<meta http-equiv="refresh" content="0; url=latest/web/index.html">
<a href="latest/web/index.html">最新版本 ${meta.version}</a>`,
  );
  console.log(`[publish] local: ${publicDir}/${version} (latest → ${version})`);
}

function publishGhPages() {
  const remote = git(["remote"]);
  if (!remote) {
    console.error("[publish] no git remote — add one (e.g. git remote add origin git@github.com:<you>/<repo>.git)");
    process.exit(1);
  }
  const dist = join(root, "dist", "gh-pages");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(join(releaseDir, "web"), dist, { recursive: true });
  writeFileSync(join(dist, ".nojekyll"), "");

  const worktree = join(root, ".gh-pages-worktree");
  rmSync(worktree, { recursive: true, force: true });
  const hasBranch = git(["ls-remote", "--heads", "origin", "gh-pages"]).length > 0;

  if (hasBranch) {
    run("git", ["worktree", "add", "-B", "gh-pages", worktree, "origin/gh-pages"]);
  } else {
    run("git", ["worktree", "add", "--detach", worktree]);
    run("git", ["checkout", "--orphan", "gh-pages"], worktree);
  }

  for (const entry of ["index.html", "assets", "favicon.ico"]) {
    rmSync(join(worktree, entry), { recursive: true, force: true });
  }
  cpSync(dist, worktree, { recursive: true });
  run("git", ["add", "-A"], worktree);
  run("git", ["-c", "user.name=mini-game-factory", "-c", "user.email=factory@local", "commit", "-m", `release ${version}`, "--allow-empty"], worktree);
  run("git", ["push", "origin", "gh-pages", "--force"], worktree);
  run("git", ["worktree", "remove", worktree, "--force"]);
  console.log(`[publish] gh-pages pushed (${version})`);
}

function publishItch() {
  const butler = valueOf("--butler") ?? which("butler");
  const channel = valueOf("--channel") ?? "html5";
  const project = valueOf("--project") ?? process.env.ITCH_PROJECT;
  if (!butler) {
    console.error("[publish] butler CLI not found — install https://itch.io/docs/butler/ or pass --butler <path>");
    process.exit(1);
  }
  if (!project) {
    console.error("[publish] --project <user/game> or ITCH_PROJECT is required for itch");
    process.exit(1);
  }
  run(butler, ["push", join(releaseDir, "web"), `${project}:${channel}`, "--userversion", version]);
  console.log(`[publish] itch: ${project}:${channel} @ ${version}`);
}

function readLatestVersion() {
  const index = join(root, "releases", "index.json");
  if (!existsSync(index)) return "";
  const list = JSON.parse(readFileSync(index, "utf8"));
  return list[0]?.version ?? "";
}

function run(cmd, cmdArgs, cwd = root) {
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[publish] failed: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

function git(gitArgs, cwd = root) {
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function which(bin) {
  const result = spawnSync("which", [bin], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
