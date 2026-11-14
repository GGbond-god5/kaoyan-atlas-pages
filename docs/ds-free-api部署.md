# ds-free-api 部署到 ECS 并接入本站

用途：把 DeepSeek 网页端反代成 OpenAI 兼容接口，作为本站的**文本 AI 通道**（教练问答、作文评分）。
拍照批改、PDF 按页抽题依赖识图，仍走千问，**不要**把视觉通道切到这里（DeepSeek 网页端 2026-09 已下线 `vision`）。

- 上游项目：<https://github.com/NIYueeE/ds-free-api>（Rust，单二进制 / Docker）
- 本站接入点：`functions/_lib/platform.js` 的 `ai()`，按有无 `image_url` 分流

---

## 0. 前置条件

- 一台常驻的 Linux 主机（阿里云 ECS 即可，1 核 1G 够用）
- 已装 Docker 与 compose 插件：`docker --version && docker compose version`
- 至少一个 DeepSeek 账号（推荐 2 个以上，按「账号数 ÷ 2」估算并发）

---

## 1. 取 `device_id`（最容易卡住的一步）

每个账号必须有**真实注册过的**设备指纹，缺失会直接被风控拒绝（`RISK_DEVICE_DETECTED`，biz_code=11），伪造无效。

1. 用 Chrome 打开 <https://chat.deepseek.com/sign_in> 并登录该账号
2. 打开开发者工具 → Console，执行：

```js
SMSdk.getDeviceId()
```

3. 记下返回值，与邮箱/密码配对保存
4. **每个账号单独做一次**（不同浏览器配置文件或无痕窗口），不要复用同一个 `device_id`

> 也可以在 Network 面板里找 `POST /api/v0/users/login` 请求体中的 `device_id` 字段。

---

## 2. 部署容器

在 ECS 上：

```bash
mkdir -p /opt/ds-free-api/config /opt/ds-free-api/data && cd /opt/ds-free-api
curl -fsSL https://raw.githubusercontent.com/NIYueeE/ds-free-api/main/docker/docker-compose.yaml -o docker-compose.yaml
curl -fsSL https://raw.githubusercontent.com/NIYueeE/ds-free-api/main/docker/config.example.toml -o config/config.toml
```

编辑 `config/config.toml`，至少确认/填写：

```toml
[server]
host = "0.0.0.0"     # 容器内必须监听 0.0.0.0，否则宿主机连不上
port = 22217

[[ds_core.accounts]]
email = "your@mail.com"
mobile = ""
area_code = ""
password = "你的 DeepSeek 密码"
device_id = "第一步取到的 device_id"
```

账号也可以留空，启动后在管理面板里添加。然后启动：

```bash
docker compose up -d
docker compose logs -f --tail=50
```

看到服务在 `0.0.0.0:22217` 监听即可。宿主机自测：

```bash
curl -s http://127.0.0.1:22217/v1/models -H "Authorization: Bearer 任意" | head
```

---

## 3. 管理面板：设密码、建 Key、确认账号

1. 浏览器打开 `http://<ECS 公网 IP>:22217/admin`（仅临时，用于初始化）
2. 首次访问设置管理密码
3. **Providers/账号** 页确认账号在线；不在线就看日志里的风控报错
4. **API Keys** 页创建一个 key，形如 `sk-...`，保存好——本站要用

---

## 4. 安全暴露到公网

不要把 22217 直接开放给公网：一旦暴露，任何拿到地址的人都能消耗你的额度。推荐用 Cloudflare Tunnel，不开入站端口、不需要域名备案：

```bash
# 安装
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 临时隧道（重启即换地址，适合先验证）
cloudflared tunnel --url http://127.0.0.1:22217
```

输出里会给出形如 `https://xxx-yyy.trycloudflare.com` 的地址。

要长期稳定，改用命名隧道绑定自己的域名（`cloudflared tunnel create ds-free-api` → DNS 路由 → `cloudflared service install`），地址就不再变。

配好后把 ECS 安全组里 22217 的入站规则**删掉**，只保留隧道访问。

---

## 5. 接入本站

Cloudflare → Workers & Pages → `kaoyan-atlas-pages` → Settings → Environment variables（**Production** 环境）：

| 变量 | 值 |
| --- | --- |
| `AI_BASE_URL` | `https://你的隧道域名/v1` |
| `AI_MODEL` | `deepseek-default` |
| `AI_API_KEY` | 管理面板生成的 `sk-...` |

保存后触发一次部署（Deployments → Retry，或 push 一个提交）。视觉那三个 `AI_VISION_*` **不要动**，保持走千问。

---

## 6. 验证

1. 打开 `https://kaoyan-atlas-pages.pages.dev/api/health`，确认 `bindings.AI_TEXT` 为 `true`
2. 在本站任一讲义/笔记里打开「AI 教练」问一句，看是否正常回复（这一步才真正验证到 DeepSeek）
3. 拍照批改仍要能出分，说明视觉通道没被误切

排查顺序：隧道地址能否 `curl .../v1/models` → key 是否有效（401/403）→ 账号是否在线（管理面板）→ 日志里是否有风控/限流。

---

## 7. 风险与维护

- **账号风险**：网页端风控会封号，建议用小号、多账号池，别用主账号
- **额度与限流**：免费额度随上游策略变化，考试高峰期可能不稳定；这就是视觉通道不切过去的原因
- **用量**：错题解析、作文评分都会走这里，出错时先看 `/api/health` 与 Cloudflare 的 Functions 日志
- **密钥**：`AI_API_KEY`、账号密码、`device_id` 只放在 ECS 的 `config.toml` 和 Cloudflare 环境变量里，不进仓库
- **回滚**：删掉 `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` 三个变量并重新部署，站点立即回到千问
