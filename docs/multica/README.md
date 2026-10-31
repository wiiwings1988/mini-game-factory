# 小游戏工厂 · 运行手册

一个仓库、一条链：**玩家反馈 → 工单 → 修复 → 构建 → 发布 → 回到反馈**。
下面写的都是可执行的东西，不是愿景。

## 1. 谁在干活

| 角色 | Agent 名 | 一句话职责 | 触发方式 |
|---|---|---|---|
| 客服 | `客服-CS` | 把反馈池的原始抱怨变成带复现信息的 issue | autopilot `feedback-triage`，每 20 分钟 |
| 开发 | `开发-Dev` | 接 issue，改代码，带测试，开 PR | issue 被 assign 时 |
| 质检 | `质检-QA` | 复现、回归、验 PR；发现新问题开 issue | autopilot `nightly-qa`，每天 03:00 |
| 发布 | `发布-Release` | 把已合并的修复发上线，写版本号回 issue 与反馈 | autopilot `release-check`，每天 21:00（也可手动） |
| 制作 | `制作-Producer` | 从反馈里提炼玩法方向，写规格 issue（不写代码） | autopilot `weekly-producer`，周一 10:00 |

一个职位一个 agent，不共用。agent 的完整职责写在 `docs/multica/agents/<角色>.md`，
落库时由 `tools/multica/apply.mjs` 读进来当 instructions，改文档 = 改 agent 行为。

## 2. 事实来源（谁说了算）

| 事情 | 权威源 | 不要看 |
|---|---|---|
| 玩家说了什么 | 反馈台 `http://127.0.0.1:8787/api/feedback` | 聊天记录、口头转述 |
| 代码是什么样 | GitHub `wiiwings1988/mini-game-factory` 的 master | 本地临时目录里的未提交改动 |
| 能不能发 | `.github/workflows/ci.yml` 的最近一次运行 | 本地 `pnpm test` 的绿色（那只说明这台机器） |
| 发出去的是什么 | `releases/<version>/` + GitHub Pages 构建产物 | 记忆里的版本号 |

## 3. 全链路

```
玩家（网页 / 微信小游戏）
   │  游戏内「反馈」按钮
   ▼
反馈台 :8787  ──写库──▶  feedback(status=new)
   │                         │
   │  webhook（可选，立即唤醒）│  客服-CS 轮询 status=new
   ▼                         ▼
autopilot feedback-triage ─▶ 建 issue（带复现信息、类型、优先级）
                              │  assign 给 开发-Dev
                              ▼
                          开发-Dev：复现 → 改 → 加测试 → 分支 → PR（标题带 issue key）
                              │
                              ▼
                          CI 绿 + 人（或质检）合入 master
                              │
                              ▼
                          发布-Release：release → publish → 版本号回写 issue 与反馈
                              │
                              ▼
                          GitHub Pages 新版本可玩；反馈状态变 published
```

## 4. 硬规则（违反即返工）

1. **不直推 master**。开发只推 `agent/<issue-key>-<slug>` 分支，PR 标题带 issue key，
   这样 Multica 才认得出「这条 PR 属于这个 issue」。
2. **修 bug 必须带一条会红的测试**。先让测试红、再让它绿，PR 里贴两次输出。
3. **发布只认已合并的 PR + 绿的 CI**。CI 红、PR 没合、构建失败，一律不许发。
4. **失败要吼出来**。任何一步失败，在 issue 里评论写清楚「哪一步、什么错、卡在哪」，
   不要静默重试到看起来成功。
5. **反馈不丢**。客服处理完每一条都要 `PATCH /api/feedback/<id>`
   写上 `issueKey` 和新状态，否则它会在池子里一直"新"。
6. **不确定就问**，在 issue 里 @ 人，不要自己猜着改架构。

## 5. 命令速查

```bash
# 本地开发
pnpm install
pnpm dev                 # http://127.0.0.1:5173 ，/api 代理到反馈台
pnpm test                # 逻辑单测（vitest，无浏览器）
node scripts/build.mjs   # web + 微信小游戏两个产物
node scripts/release.mjs --notes "本次改了什么"
node scripts/publish.mjs --target local   # 或 gh-pages / itch

# 反馈台
node tools/feedback-service/src/server.mjs        # :8787
curl -s 'http://127.0.0.1:8787/api/feedback?status=new'
curl -s 'http://127.0.0.1:8787/api/feedback/<id>/draft'   # 现成的 issue 草稿

# Multica（工作区「老人星」）
multica --profile desktop-api.multica.ai --workspace-id e9fe338e-511d-429d-b82c-bd68be552a16 issue list
```

## 6. 加新游戏

`games/<名字>/src/` 放规则 + 渲染，`apps/web` 和 `apps/wx` 各加一个入口即可。
规则层不许 import 任何 DOM / 平台 API —— 这是它能在浏览器、微信小游戏、原生壳里
跑同一套逻辑、也能在 CI 里被单测的原因。
