# 短信验证码 + 注册登录服务

这套服务同时托管整站静态文件（可以替代 `serve.py`）和账号接口，跑在阿里云 ECS 上；
网页本体部署在 Cloudflare Pages。

## 快速开始

```bash
cp .env.example .env       # Windows: copy .env.example .env
npm install
npm start                  # http://127.0.0.1:3000
```

不填任何阿里云配置也能跑：会自动进入 `mock` 模式，验证码直接打印在控制台，
注册页会自动填入，方便先把页面走通。

## 真实发短信

个人实名认证账号请用「号码认证服务 · 短信认证」：

```ini
SMS_PROVIDER=pnvs
ALIYUN_ACCESS_KEY_ID=...
ALIYUN_ACCESS_KEY_SECRET=...
ALIYUN_SMS_SIGN_NAME=控制台赠送的签名名称
# 模板编号留空 = 赠送的 100001（登录/注册）
```

启动后访问 `/api/health` 自检：会显示当前通道、是否配置完整、还缺哪些变量。

完整的开通步骤、Cloudflare Pages 与 ECS 的部署方式、安全说明，见
[`../docs/短信登录接入指南.md`](../docs/短信登录接入指南.md)。

## 目录

```
index.js          Express 入口：路由、限流、静态托管
lib/sms.js        阿里云短信两条通道（pnvs / dysms）+ RPC 签名
lib/auth.js       scrypt 口令哈希、HMAC 令牌、Cookie
lib/store.js      JSON 存储（用户 / 验证码 / 每日配额）
lib/grade.js      AI 评卷代理（从 serve.py 移植）
lib/env.js        极简 .env 读取
data/             运行时数据（db.json、secret.key），不要提交、记得备份
```

## 注意

- `data/secret.key` 丢了会让所有人登出；换服务器时一起带走。
- `.env` 里有 AccessKey，永远不要提交到仓库；Cloudflare 部署已用 `.assetsignore` 排除 `server/`。
- 线上必须 HTTPS，并设置 `NODE_ENV=production`、`COOKIE_SECURE=1`、`TRUST_PROXY=1`。
