#!/usr/bin/env node
/**
 * Provisions the Multica side of the factory: project, agents, autopilots.
 *
 * Idempotent: run it as often as you like. Agent instructions are read from
 * docs/multica/agents/*.md on every run, so editing the doc IS editing the agent.
 *
 *   MULTICA_WORKSPACE_ID=<uuid> node tools/multica/apply.mjs
 *   node tools/multica/apply.mjs --dry-run
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const profile = process.env.MULTICA_PROFILE ?? "desktop-api.multica.ai";
const workspaceId = process.env.MULTICA_WORKSPACE_ID ?? "e9fe338e-511d-429d-b82c-bd68be552a16";
const statePath = join(root, ".multica-state.json");

const factory = JSON.parse(readFileSync(join(root, "docs/multica/factory.json"), "utf8"));
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { agents: {}, autopilots: {}, project: null };

const base = ["--profile", profile, "--workspace-id", workspaceId];

function cli(cliArgs, { json = true, allowFail = false } = {}) {
  if (dryRun) {
    console.log(`[dry-run] multica ${base.join(" ")} ${cliArgs.join(" ")}`);
    return { ok: true, data: null };
  }
  const result = spawnSync("multica", [...base, ...cliArgs], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    if (allowFail) return { ok: false, error: (result.stderr || result.stdout).trim() };
    console.error(`\n[apply] FAILED: multica ${cliArgs.join(" ")}\n${(result.stderr || result.stdout).trim()}`);
    process.exit(result.status ?? 1);
  }
  let data = null;
  if (json && result.stdout.trim()) {
    try {
      data = JSON.parse(result.stdout);
    } catch {
      data = result.stdout.trim();
    }
  }
  return { ok: true, data };
}

// ---------------------------------------------------------------- project ---
function ensureProject() {
  const list = cli(["project", "list", "--output", "json"]).data ?? [];
  const existing = list.find((p) => p.title === factory.project);
  if (existing) {
    state.project = { id: existing.id, title: existing.title };
    console.log(`[apply] project exists: ${existing.title} (${existing.id})`);
    return existing.id;
  }
  const created = cli([
    "project", "create", "--title", factory.project,
    "--repo", "https://github.com/wiiwings1988/mini-game-factory", "--output", "json",
  ]).data;
  if (!created) return "dry-run-project";
  state.project = { id: created.id, title: created.title };
  console.log(`[apply] project created: ${created.id}`);
  return created.id;
}

// ----------------------------------------------------------------- agents ---
function runtimeIdFor(provider) {
  const runtimes = cli(["runtime", "list", "--output", "json"]).data ?? [];
  if (dryRun) return `dry-run-runtime-${provider}`;
  const runtime = runtimes.find((r) => r.provider === provider);
  if (!runtime) {
    console.error(`[apply] no runtime for provider "${provider}". Available: ${runtimes.map((r) => r.provider).join(", ")}`);
    process.exit(1);
  }
  return runtime.id;
}

function ensureAgents() {
  const existing = cli(["agent", "list", "--output", "json"]).data ?? [];
  for (const agent of factory.agents) {
    const doc = readFileSync(join(root, agent.doc), "utf8");
    const found = existing.find((a) => a.name === agent.name && !a.archived_at);
    if (found) {
      cli(["agent", "update", found.id, "--instructions", doc, "--description", agent.description, "--output", "json"]);
      state.agents[agent.name] = found.id;
      console.log(`[apply] agent updated: ${agent.name} (${found.id})`);
      continue;
    }
    const runtimeId = runtimeIdFor(agent.runtime);
    const created = cli([
      "agent", "create",
      "--name", agent.name,
      "--description", agent.description,
      "--instructions", doc,
      "--runtime-id", runtimeId,
      "--permission-mode", "private",
      "--output", "json",
    ]).data;
    state.agents[agent.name] = created?.id ?? (dryRun ? `dry-run-agent-${agent.name}` : null);
    console.log(`[apply] agent created: ${agent.name} (${state.agents[agent.name]})`);
  }
}

// ---------------------------------------------------------------- archive ---
function archiveRetiredAgents() {
  const retired = factory.archiveAgents ?? [];
  if (retired.length === 0) return;
  const existing = cli(["agent", "list", "--output", "json"]).data ?? [];
  for (const name of retired) {
    const found = existing.find((a) => a.name === name && !a.archived_at);
    if (!found) continue;
    cli(["agent", "archive", found.id, "--output", "json"]);
    console.log(`[apply] agent archived: ${name} (${found.id})`);
  }
}

// ------------------------------------------------------------- autopilots ---
function ensureAutopilots(projectId) {
  const listed = cli(["autopilot", "list", "--output", "json"]).data;
  const existing = Array.isArray(listed) ? listed : (listed?.autopilots ?? []);
  for (const ap of factory.autopilots) {
    const agentId = state.agents[ap.agent];
    if (!agentId) {
      console.error(`[apply] autopilot ${ap.title}: agent ${ap.agent} has no id yet`);
      process.exit(1);
    }
    const found = existing.find((a) => a.title === ap.title || (ap.titleFrom && a.title === ap.titleFrom));
    let id = found?.id;
    if (found) {
      cli(["autopilot", "update", id, "--title", ap.title, "--agent", agentId, "--description", ap.description, "--status", "active", "--output", "json"]);
      console.log(`[apply] autopilot updated: ${found.title} → ${ap.title} (${id})`);
    } else {
      const created = cli([
        "autopilot", "create",
        "--title", ap.title,
        "--description", ap.description,
        "--agent", agentId,
        "--mode", ap.mode,
        "--project", projectId,
        "--output", "json",
      ]).data;
      id = created?.id;
      console.log(`[apply] autopilot created: ${ap.title} (${id})`);
    }
    state.autopilots[ap.title] = id;

    const listedTriggers = cli(["autopilot", "trigger-list", id, "--output", "json"], { allowFail: true }).data;
    const triggers = Array.isArray(listedTriggers) ? listedTriggers : (listedTriggers?.triggers ?? []);
    const hasSchedule = triggers.some((t) => (t.kind ?? t.type) === "schedule");
    if (!hasSchedule) {
      cli([
        "autopilot", "trigger-add", id,
        "--kind", "schedule", "--cron", ap.cron, "--timezone", "Asia/Shanghai", "--output", "json",
      ]);
      console.log(`[apply] autopilot schedule added: ${ap.title} ${ap.cron} Asia/Shanghai`);
    }
  }
}

// ------------------------------------------------------------------ main ----
const projectId = ensureProject();
ensureAgents();
archiveRetiredAgents();
ensureAutopilots(projectId);

if (!dryRun) {
  writeFileSync(statePath, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`[apply] state → ${statePath}`);
}
console.log("[apply] done");
