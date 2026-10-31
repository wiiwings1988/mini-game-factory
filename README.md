# 小游戏工厂 Mini Game Factory

一套能自己跑的小游戏生产线：**玩家反馈 → 工单 → AI 改代码 → 构建 → 上线 → 回写反馈**。
代码在这里，工单板在 Multica（工作区「老人星」→ 项目「小游戏工厂」）。

```
players ──反馈──▶ 反馈台 :8787 ──▶ 客服 agent ──▶ issue
                                                  │
                                       开发 agent 改代码 / 带测试 / 开 PR
                                                  │
                                             CI 绿 + 合并
                                                  │
                                       发布 agent：构建 → Pages → 回写
                                                  ▼
                                            玩家玩到新版
```

## 为什么是这个技术栈

要求是「海外上架 App Store / Google Play，同时兼容微信小游戏和 H5，而且 AI 要能全自动开发」。
这三条放在一起，能选的其实不多：

| 方案 | 为什么没选 |
|---|---|
| Unity / Cocos Creator | 编辑器是 GUI、场景是二进制资产。AI 全自动开发会卡在"点编辑器"这一步，命令行构建还要装编辑器与 license。 |
| Godot | 场景是文本、AI 友好，但微信小游戏没有官方导出路径。 |
| Phaser 等 Web 引擎 | 能跑 H5，但微信小游戏没有 DOM，仍要一层 shim；包体也偏大。 |
| **自研轻量 2D 引擎（本仓库）** | 只依赖 Canvas2D 那几十个 API —— 浏览器、微信小游戏、Capacitor 原生壳里是同一套。包体 14KB（gzip 5.5KB），微信 4MB 主包限制毫无压力。代价是物理/瓦片地图这类要自己补，对"先做小游戏"的人来说不亏。 |

所以：**TypeScript + 自研 Canvas2D 引擎 + Vite**，规则层是纯函数、不碰 DOM，
渲染层只认 `Canvas2DLike` 接口，平台差异（登录、支付、分享、存储、触摸）全在 `packages/platform` 里分适配器。

### 上架相关的两条硬约束（不是建议，是平台规则）

1. **登录**：iOS 上只要提供任何第三方登录（Google/微信…），就必须同时提供 Sign in with Apple。
   所以 `AuthService` 的默认实现是**游客身份**（本地生成稳定 id），第三方登录是"升级"，不是前置条件。
2. **支付**：iOS / Google Play 上的**数字商品**必须走平台内购（Apple IAP / Google Play Billing），
   不能接 Stripe/Paddle；网页版和 itch.io 才能用 Stripe。所以 `PurchaseService` 是按平台分适配器的接口，
   `UnavailablePurchase` 是当前占位——没接内购之前，它明确返回 `unavailable`，不会假装成功。
   微信小游戏：安卓可用虚拟支付，iOS 不允许虚拟支付。

## 目录

```
packages/engine/      纯 TS 2D 引擎：固定步长循环、输入、确定性 RNG、存档、渲染接口（零 DOM）
packages/platform/    平台契约与适配器：web / wx（微信小游戏）/ headless（测试）
games/arcade-dodge/   样板游戏：规则（纯函数）+ 渲染，可换皮成新游戏
apps/web/             浏览器入口（Vite）
apps/wx/              微信小游戏入口（构建成 game.js + game.json）
tools/feedback-service/  反馈台：HTTP + SQLite + 网页收件箱 + webhook 出站（零外部依赖）
tools/multica/apply.mjs  把 agent / autopilot 配置同步到 Multica（幂等）
docs/multica/         五个 agent 的职责说明 + 运行手册
scripts/              build / release / publish / preview
```

## 快速开始

```bash
pnpm install

# 1) 本地开发（/api 自动代理到反馈台）
pnpm dev                      # http://127.0.0.1:5173

# 2) 反馈台（另开一个终端；已经装成 launchd 服务的机器上不用手动起）
pnpm feedback                 # http://127.0.0.1:8787  ← 网页收件箱

# 3) 测试与构建
pnpm test                     # 20 条逻辑单测，无浏览器
node scripts/build.mjs        # dist/web（14KB）+ dist/wx（11KB）

# 4) 发版与发布
node scripts/release.mjs --notes "修了什么"
node scripts/publish.mjs --target local     # 也可以 gh-pages / itch
```

## 这条链是怎么通电的

| 环节 | 谁干 | 触发 |
|---|---|---|
| 收反馈 | 游戏里「反馈」按钮 → `POST /api/feedback` | 玩家点一下 |
| 变工单 | `客服-CS`：去重、分类、定级、建 issue、回写反馈 | autopilot `feedback-triage`，每 20 分钟 |
| 修代码 | `开发-Dev`：先写会红的测试，再修，开 PR | issue 指派给它时 |
| 独立验证 | `质检-QA`：回归、复现、审 PR、线上冒烟 | autopilot `nightly-qa`，每天 03:00 |
| 上线 | `发布-Release`：四道门过了才构建发布，版本号回写 | autopilot `release-check`，每天 21:00 |
| 找方向 | `制作-Producer`：从反馈聚类出下一版玩法 | autopilot `weekly-producer`，周一 10:00 |

agent 的完整职责写在 `docs/multica/agents/*.md`，Multica 侧由 `node tools/multica/apply.mjs` 同步
（**改文档 = 改 agent**，不要在网页上手改 instructions，会被下次同步覆盖）。

## 已经能跑通的部分（截至 2026-10-31）

- ✅ 游戏可玩：`public/latest/web/`，Playwright 实测「开始 → 掉落 → 撞死 → 重开」全流程无报错
- ✅ 反馈闭环：游戏内表单 → 反馈台入库 → 网页收件箱可读可改 → 一键生成 issue 草稿
- ✅ 双端构建：web 14KB / 微信小游戏 11KB，同一份规则代码
- ✅ 发布链路：`release` 冻结版本目录 → `publish` 出 `public/latest` → GitHub Pages 由 Actions 部署
- ✅ Multica：项目 + 5 个 agent + 4 个 autopilot 已建，客服试跑成功建出 issue（见 `docs/multica/验收记录.md`）

## 还没接的（按优先级）

1. **微信登录 / 内购**：适配器接口留好了，具体实现在 `packages/platform`；要真接需要 appid 与商店后台。
2. **itch.io 上传**：`scripts/publish.mjs --target itch` 已写好，需要本机装 butler 与项目名。
3. **Capacitor 原生壳**：`apps/web` 产物可直接包，还没包（要先决定 iOS/Android 的签名与版本策略）。
4. **远端反馈台**：现在只监听 127.0.0.1，玩家在外网提交不到；上线前要么放公网（带限流与鉴权），要么走微信云函数。
