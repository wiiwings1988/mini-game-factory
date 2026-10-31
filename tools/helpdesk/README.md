# 对外反馈层：Chatwoot 自托管

> **当前状态：已停用（2026-10-31）。** 容器与数据卷已删除，colima 已停；本目录只保留成型的
> 安装配方（compose + seed.rb），有真玩家、真要对外开门时按下面步骤重装即可。
> 停用原因：现在没有真实用户，且这台 Mac 会关机——对外入口本来就必须有一台常开的机器。
> 重装：`colima start --cpu 4 --memory 8 --disk 60` → `docker compose up -d` → 跑 seed.rb。

## 这东西解决什么

玩家提反馈之后，缺的不是「收到」，是**有人回、他能看到进展**。
Chatwoot 补的就是这一层：

| help desk 的六件事 | 我们自建的 629 行 | Chatwoot |
|---|---|---|
| 多渠道收口 | 只有网页表单一个 | 网页 widget / 邮件 / API / 微信等 |
| 排队与 SLA | 无 | 收件箱、优先级、SLA 计时 |
| 线程式对外回复 | 只能写草稿，发不出去 | 完整线程、模板、内部备注隔离 |
| 认人（同一人多次来信） | 无 | 联系人自动合并历史 |
| 自助（提交前挡掉一部分） | 无 | 帮助中心 / FAQ |
| 报表（满意度、首响时长） | 只有状态计数 | CSAT、报表 |

## 两本账的分工（硬规矩）

- **Chatwoot = 对外唯一的对话处**。跟玩家的每一句话都在这里，含回复、状态、历史。
- **Multica = 内部唯一的台账**。要动代码的事，在这里是 issue。
- 两边只靠**链接**相连：issue 里贴 conversation 链接，conversation 里贴 issue key。不要把同一件事在两边各记一份正文。

## 起服务

macOS 上用 colima 跑容器，不需要管理员密码（不要装 Docker Desktop）：

```bash
brew install colima docker docker-compose
mkdir -p ~/.docker && cat > ~/.docker/config.json <<'JSON'
{ "cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"] }
JSON
colima start --cpu 4 --memory 8 --disk 60

cd tools/helpdesk
cp .env.example .env      # 然后填两个随机串：
#   openssl rand -hex 64   → SECRET_KEY_BASE
#   openssl rand -hex 16   → POSTGRES_PASSWORD
docker compose run --rm rails bundle exec rails db:chatwoot_prepare   # 仅首次
docker compose up -d

# 建管理员 + 网站收件箱，打出 WEBSITE_TOKEN（邮箱域名要有 MX 记录，
# 否则 Chatwoot 的注册校验会判 invalid，所以这里绕开注册页直接建）
SEED_EMAIL=you@example.com SEED_PASSWORD='...' \
  docker compose exec -T -e SEED_EMAIL -e SEED_PASSWORD rails \
  bundle exec rails runner /dev/stdin < seed.rb
```

起来后 <http://localhost:3000> 用那个账号登录。

注意 compose 里开了 `ENABLE_API_CORS=true`：网站 widget 从玩家浏览器跨域调
`/api/v1/widget/*`，不开这个，浏览器会把请求拦掉（现象是 widget 能弹出但发不出消息）。

## 接到游戏页

`apps/web` 里放 widget，由环境变量注入：

```html
<script>
  window.chatwootSettings = { position: 'right', locale: 'zh_CN', type: 'standard' };
  (function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src='<CHATWOOT_BASE_URL>/packs/js/sdk.js';g.defer=true;g.async=true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){window.chatwootSDK.run({websiteToken:'<WEBSITE_TOKEN>',baseUrl:'<CHATWOOT_BASE_URL>'})};
  })(document,'script');
</script>
```

游戏里那个反馈按钮改成 `window.$chatwoot.toggle('open')`，把当前局面（版本号、关卡、最高分）用
`window.$chatwoot.setCustomAttributes({...})` 带进去——原来我们表单里的 `context` 就是这么用的。

两个值（base URL / website token）在 Chatwoot 后台「收件箱 → 网站」里拿，写进 GitHub 仓库变量
`CHATWOOT_BASE_URL` / `CHATWOOT_WEBSITE_TOKEN`，构建时注入，**不要把 token 写死进仓库**。

## 迁到云主机

整个目录原样复制，只改 `.env` 里的 `FRONTEND_URL`。这台 Mac 会关机，公网入口不能长期挂在它上面。
