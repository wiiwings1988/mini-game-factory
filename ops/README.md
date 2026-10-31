# 本机常驻服务

## 反馈台（com.joker.minigame.feedback）

`http://127.0.0.1:8787` —— 玩家反馈的收件口，也是客服 agent 的数据源。
由 launchd 常驻，崩溃自动拉起，开机自启。

```bash
# 看状态（沙箱内 launchctl list 不可信，用 print）
launchctl print gui/$(id -u)/com.joker.minigame.feedback | grep -E 'state|pid|last exit'

# 健康检查
curl -s http://127.0.0.1:8787/health

# 日志
tail -f logs/feedback.out.log logs/feedback.err.log

# 停 / 起
launchctl bootout   gui/$(id -u)/com.joker.minigame.feedback
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.joker.minigame.feedback.plist
```

数据在 `tools/feedback-service/data/feedback.db`（SQLite，已 gitignore）。
删库即清空，服务下次请求会自动重建表。

### 为什么是 launchd 而不是 `nohup node ... &`

因为 `nohup` 起的进程在**关机、崩溃、会话结束时都会静默消失**，而客服 agent 的定时任务不会因此报错——
它只会一直读到"没有新反馈"。这是典型的静默失效。launchd 至少有 `KeepAlive` 和可查的退出码。

### 注意

- 只监听 `127.0.0.1`，外网玩家提交不到。给线上版本收反馈需要先把它放到公网（加限流和鉴权），
  再把地址通过 `VITE_FEEDBACK_ENDPOINT` 打进前端构建。
- 不要在这个服务里写业务判断（分类、去重、优先级）——那些是客服 agent 的活。
  服务只做三件事：存、读、通知。
