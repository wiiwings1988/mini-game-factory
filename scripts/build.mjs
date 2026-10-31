#!/usr/bin/env node
/**
 * Build targets. One command, explicit output, a manifest that release/publish
 * read instead of guessing what was produced.
 *
 *   node scripts/build.mjs              # web + wx
 *   node scripts/build.mjs --target web
 *   node scripts/build.mjs --target wx
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const args = process.argv.slice(2);
const targetArg = valueOf("--target") ?? "all";
const targets = targetArg === "all" ? ["web", "wx"] : [targetArg];

for (const target of targets) {
  if (!["web", "wx"].includes(target)) {
    console.error(`unknown target: ${target}`);
    process.exit(2);
  }
}

const run = (cmd, cmdArgs) => {
  const result = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\n[build] failed: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(result.status ?? 1);
  }
};

const vp = join(root, "node_modules/.bin/vite");

if (targets.includes("web")) {
  console.log("\n[build] web → dist/web");
  run(vp, ["build", "--config", "apps/web/vite.config.ts"]);
}

if (targets.includes("wx")) {
  console.log("\n[build] wx → dist/wx");
  run(vp, ["build", "--config", "apps/wx/vite.config.ts"]);
  const outDir = join(root, "dist/wx");
  mkdirSync(outDir, { recursive: true });
  for (const file of ["game.json", "project.config.json"]) {
    cpSync(join(root, "apps/wx/templates", file), join(outDir, file));
  }
}

const manifest = {
  name: pkg.name,
  version: pkg.version,
  builtAt: new Date().toISOString(),
  targets: {},
};
for (const target of targets) {
  const dir = join(root, "dist", target);
  manifest.targets[target] = {
    dir: `dist/${target}`,
    files: countFiles(dir),
    bytes: dirSize(dir),
  };
}
writeFileSync(join(root, "dist/build-manifest.json"), JSON.stringify(manifest, null, 2));

for (const [target, info] of Object.entries(manifest.targets)) {
  console.log(`[build] ${target}: ${info.files} files, ${(info.bytes / 1024).toFixed(1)} KB`);
}
console.log(`[build] manifest → dist/build-manifest.json`);

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function countFiles(dir) {
  try {
    return readdirSync(dir, { recursive: true }).filter((entry) => statSync(join(dir, entry)).isFile()).length;
  } catch {
    return 0;
  }
}

function dirSize(dir) {
  try {
    return readdirSync(dir, { recursive: true })
      .map((entry) => {
        const full = join(dir, entry);
        return statSync(full).isFile() ? statSync(full).size : 0;
      })
      .reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}
