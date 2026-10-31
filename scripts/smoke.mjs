#!/usr/bin/env node
/**
 * 端到端冒烟：不测功能细节，只验「这条链还通不通」。
 *
 *   node scripts/smoke.mjs                       # 查线上 + 本机反馈台
 *   node scripts/smoke.mjs --site http://127.0.0.1:4173
 *
 * 每项打印 PASS/FAIL 与凭据（状态码、字节数、返回的 id）。退出码非 0 即冒烟失败。
 */
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const site = valueOf("--site") ?? "https://wiiwings1988.github.io/mini-game-factory/";
const desk = valueOf("--desk") ?? "http://127.0.0.1:8787";

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const get = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, text: await res.text(), headers: res.headers };
};

// 1. 页面能打开
let page = null;
try {
  page = await get(site);
  check("站点 200", page.status === 200, `${page.status} · ${new URL(site).host}`);
} catch (error) {
  check("站点 200", false, String(error).slice(0, 120));
}

// 2. 不是空壳：页面引用的 JS 能取到，且页面里有 canvas 挂载点
if (page?.status === 200) {
  const hasCanvas = page.text.includes('id="game"');
  check("页面有游戏挂载点", hasCanvas, hasCanvas ? '<canvas id="game">' : "没找到 canvas");

  const asset = page.text.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (asset) {
    try {
      const js = await get(new URL(asset, site).toString());
      check("构建产物可取", js.status === 200 && js.text.length > 5000, `${asset} · ${js.text.length}B`);
    } catch (error) {
      check("构建产物可取", false, String(error).slice(0, 120));
    }
  } else {
    check("构建产物可取", false, "页面里没有 assets/index-*.js");
  }
}

// 3. 反馈台活着
let healthy = false;
try {
  const health = await get(`${desk}/health`);
  const body = JSON.parse(health.text);
  healthy = health.status === 200 && body.ok === true;
  check("反馈台健康", healthy, `total=${body?.stats?.total ?? "?"}`);
} catch (error) {
  check("反馈台健康", false, String(error).slice(0, 120));
}

// 4. 反馈真的能进能出（写一条，读回来，再收尾标 wontfix）
if (healthy) {
  const stamp = createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 8);
  const message = `[smoke] 自动冒烟 ${stamp}：这条是脚本写的，别当成玩家反馈`;
  try {
    const created = await get(`${desk}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "other", message, appVersion: "smoke", platform: "cli" }),
    });
    const id = JSON.parse(created.text).id;
    check("反馈可写入", created.status === 201 && Boolean(id), id);

    const listed = await get(`${desk}/api/feedback?limit=5`);
    const found = JSON.parse(listed.text).items?.some((item) => item.id === id);
    check("反馈可读回", found === true, id);

    const patched = await get(`${desk}/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "wontfix", note: "smoke 自动收尾" }),
    });
    check("反馈状态可改", patched.status === 200, id);
  } catch (error) {
    check("反馈链路", false, String(error).slice(0, 120));
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
