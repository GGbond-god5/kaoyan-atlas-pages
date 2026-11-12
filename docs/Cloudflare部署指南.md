# 部署到 Cloudflare Pages：短信注册登录上线手册

适用形态：GitHub 仓库 + Cloudflare Pages 自动构建，接口用 Pages Functions，数据用 D1。
不需要 ECS，不需要备案，接口与网页同域，也没有跨域和 Cookie 问题。

## 一、已经准备好的东西

仓库里这些文件是这次新增的，直接 push 上去就会被 Cloudflare 识别：

```
functions/_lib/http.js        JSON 响应、手机号校验、公开字段
functions/_lib/security.js    PBKDF2 口令哈希、HMAC 会话令牌、Cookie
functions/_lib/sms.js         阿里云短信认证（SendSmsVerifyCode / CheckSmsVerifyCode）
functions/_lib/db.js          D1 数据访问与建表
functions/_lib/verify.js      验证码校验（注册与验证码登录共用）
functions/api/health.js       GET  /api/health
functions/api/sms/send.js     POST /api/sms/send
functions/api/auth/register.js POST /api/auth/register
functions/api/auth/login.js   POST /api/auth/login
functions/api/auth/logout.js  POST /api/auth/logout
functions/api/auth/me.js      GET  /api/auth/me
login.html  register.html  assets/auth.css  assets/auth.js  assets/auth-nav.js
```

目录名以 `_` 开头（`_lib`）不会被当成路由，所以里面的代码不会被外部直接访问。

`server/` 那套 Node 版本可以留着本地用，也可以删掉，两边逻辑一致。

## 二、先在控制台建数据库

Pages 的接口需要一个 D1 数据库存用户。免费额度：5 GB 存储、每天 500 万次读、10 万次写，学生项目用不到零头。

1. Cloudflare 控制台左侧 **Storage & Databases → D1 SQL Database → Create database**。
2. 名字填 `kaoyan-atlas-accounts`，创建。
3. 回到 **Workers & Pages → 你的项目 → Settings → Bindings → Add → D1 database**。
4. **Variable name 必须填 `DB`**（代码里就是按这个名字取的），Database 选 `kaoyan-atlas-accounts`。
5. 环境选 Production，Preview 也加一遍。

> 注意不要复用旧的 `kaoyan-atlas-auth` 库：里面有另一套账号表（`users` 没有 phone 字段），
> `CREATE TABLE IF NOT EXISTS` 会跳过建表，接口会一直报「数据库未就绪」。本项目已改用独立库
> `kaoyan-atlas-accounts`（ID `0e82bbde-a58e-40c5-a0e3-ebb6d67d1b4f`），并写入 `wrangler.toml`。

表结构不用手动建，第一次调用接口时会自动 `CREATE TABLE IF NOT EXISTS`。

## 三、再填环境变量

同一个页面：**Settings → Variables and Secrets**。带 Secret 的项一定要用 **Encrypt**。

| 变量名 | 类型 | 填什么 |
| --- | --- | --- |
| `SESSION_SECRET` | Secret | 32 位以上的随机串，可用 `openssl rand -hex 32` 生成 |
| `ALIYUN_ACCESS_KEY_ID` | Secret | RAM 子账号的 AccessKey ID |
| `ALIYUN_ACCESS_KEY_SECRET` | Secret | 对应的 AccessKey Secret |
| `ALIYUN_SMS_SIGN_NAME` | Text | 你在控制台看到的赠送签名名，例如「恒创联众」 |
| `ALIYUN_SMS_TEMPLATE_CODE` | Text | 留空即用赠送的 `100001`（登录/注册） |
| `ALIYUN_SMS_REGION` | Text | `cn-hangzhou`，不填也是这个 |
| `DASHSCOPE_API_KEY` | Secret | AI 评卷用，不填则评卷接口返回 503，不影响登录 |

可选：

| 变量名 | 默认 | 作用 |
| --- | --- | --- |
| `SMS_DEV_CODE` | 关闭 | 设为 `1` 时，模拟模式下把验证码返回给前端；**线上别开** |
| `SMS_PHONE_DAILY_LIMIT` | 10 | 单号码每天最多获取几次验证码 |
| `SMS_IP_DAILY_LIMIT` | 20 | 单 IP 每天最多获取几次 |
| `PBKDF2_ITERATIONS` | 20000 | 口令哈希迭代次数，免费版别调太高 |

关于 `ALIYUN_SMS_SIGN_NAME`：赠送签名有好几个名字（恒创联众、恒锐创岳等），**任选一个通过审核的即可**，它必须配赠送模板使用，不能和自定义模板混搭。模板 `100001` 的内容是「您的验证码为${code}。尊敬的客户，以上验证码${min}分钟内有效……」，所以代码传的参数是 `{"code":"##code##","min":"5"}`，`min` 这个变量不能少。

关于 RAM 权限：子账号需要 `AliyunDypnsFullAccess`（号码认证服务）。**不要用主账号 AccessKey**，也不要把它写进仓库。

## 四、push 代码，等自动构建

```bash
git add functions login.html register.html assets/auth.css assets/auth.js assets/auth-nav.js docs
git commit -m "feat: 短信验证码注册登录（Cloudflare Pages Functions + D1）"
git push
```

Cloudflare Pages 会自己触发构建。构建日志里能看到 `functions/api/*` 被编译成 Worker 路由。

如果你的 Pages 项目是「直接上传」而不是接 GitHub，就用 `npx wrangler pages deploy .` 手动传一次。

**注意：Pages 的直接上传不读取 `.assetsignore`**（那是 Workers 静态资源的规则），它会把目录下所有文件都扫进去。
本仓库的 `bank/` 有 16 GB，直接传会先撞上「单文件 25 MiB」限制而失败。正确做法是先做一个干净的暂存目录，再部署：

```bash
rm -rf .pages-deploy && mkdir .pages-deploy
cp -al index.html vocab.html timeline.html practice.html bank.html login.html register.html .pages-deploy/
cp -al assets web content pdf functions wrangler.toml .pages-deploy/
cd .pages-deploy && npx wrangler pages deploy . --project-name kaoyan-atlas --branch master
```

`cp -al` 是硬链接，不占额外磁盘。`functions/` 和 `wrangler.toml` 必须一起带上，D1 绑定才会生效。

## 五、部署后先自检

浏览器打开 `https://你的站点/api/health`，正常会返回类似：

```json
{
  "ok": true,
  "service": "kaoyan-atlas",
  "smsMode": "pnvs",
  "smsMissing": [],
  "bindings": { "D1": true, "SESSION_SECRET": true, "DASHSCOPE_API_KEY": false },
  "smsDevCode": false,
  "signName": "恒创联众",
  "templateCode": "100001"
}
```

对照检查：

- `smsMode` 是 `mock` 说明没读到 AK，短信不会真发，只会写日志。
- `bindings.D1` 是 `false` 说明绑定没加或变量名不是 `DB`。
- `smsMissing` 里列出的就是还缺的变量名。

## 六、走一遍真实流程

1. 打开 `/register.html`，填手机号，点「获取验证码」。
2. 手机应收到「您的验证码为 123456……」的短信。
3. 填验证码、昵称、密码（8–32 位，含字母和数字），提交。
4. 跳回首页，右上角按钮显示你的昵称。
5. 点昵称能看到注册时间、最近登录时间，可以退出。
6. 退出后打开 `/login.html`，用密码或验证码登录都能进。

## 七、报错对照表

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 「短信余额不足」 | 账户没余额或没买套餐 | 控制台充点钱，按条计费，几分钱一条 |
| 「尚未开通号码认证服务」 | 控制台没开通短信认证 | 号码认证服务里开通「短信认证」和「融合认证」 |
| 「短信签名与模板不匹配」 | 签名名写错，或用了自定义模板 | 核对赠送签名原名，模板留空用 100001 |
| 「模板变量不匹配」 | 少传了 `min` | 检查 `functions/_lib/sms.js` 的 TemplateParam |
| 「RAM 子账号缺少 AliyunDypnsFullAccess」 | 子账号没授权 | RAM 控制台加权限策略 |
| 「签名校验失败」 | AccessKeySecret 填错 | 重新生成并更新 Secret |
| 「数据库未就绪」 | D1 没绑定或名字不是 DB | 回去看第二节第 4 步 |
| 「站点配置缺失：未设置 SESSION_SECRET」 | 没配会话密钥 | 加上 `SESSION_SECRET` 后重新部署 |
| 注册成功但顶栏还显示「登录」 | 被浏览器缓存或 Cookie 未生效 | 强制刷新一次；确认访问的是自定义域名而不是预览地址 |

## 八、可用性与成本

- **在线时长**：Pages 和 D1 都是托管的，不依赖任何一台你自己的机器，电脑关机也照常工作。
- **免费额度**：Pages 静态请求不限量；Functions 免费版每天 10 万次请求、单次 10ms CPU。登录接口一次 PBKDF2 大约几十毫秒 CPU，**风险点就在这里**，所以默认迭代次数压到 20000；如果频繁触发 `1102` 错误，就把 `PBKDF2_ITERATIONS` 再调低，或升到 Workers Paid（$5/月，30 秒 CPU）。
- **短信费用**：由阿里云按条计费，发送失败不计费，核验免费。300 元学生券能否抵扣要看券的适用产品范围，别默认它管短信。
- **数据备份**：D1 可在控制台直接导出 SQL，也可以定时 `wrangler d1 export kaoyan-atlas --output backup.sql`。

## 九、安全清单

- 密码用 PBKDF2-SHA256 加盐哈希，不存明文；验证码不落库（pnvs 由阿里云核验）。
- 同号码 60 秒一条、每日 10 条，同 IP 每日 20 条；验证码错误 5 次作废；密码连错 5 次锁 10 分钟。
- 会话是 HMAC 签名令牌，HttpOnly + Secure + SameSite=Lax Cookie，同时支持 Bearer 头。
- 所有 AK、Secret 只放 Cloudflare 环境变量，不进仓库；`.gitignore` 和 `.assetsignore` 都已排除敏感目录。
- **马上要做的事**：不要在任何聊天、截图、文档里贴 Cloudflare 或 GitHub 的账号密码。如果贴过，立刻改密码并开启两步验证；同时检查这两个账号有没有未知的登录设备。

## 十、本地预览（可选）

改了接口想先在本地验证，需要 Node 18 以上：

```bash
npx wrangler pages dev . --d1=DB \
  --binding SESSION_SECRET=local-dev-secret \
  --binding SMS_DEV_CODE=1
```

首次运行会提示登录 Cloudflare（浏览器授权一次），然后给出 `http://127.0.0.1:8788`。
本地 D1 数据存在 `.wrangler/` 目录里，不会污染线上。

`smsMode=mock` 时，`SMS_DEV_CODE=1` 会把验证码直接返回给页面并自动填入，方便注册登录全流程调试；
**线上千万不要设置这个变量**。注册页、登录页与接口均已在此模式下端到端验证过。

## 十一、如果站点还开着 Basic Auth

线上若仍配置了 `SITE_USER` / `SITE_PASS` 全站保护，登录功能可以正常工作：
同域请求走 HttpOnly Cookie，浏览器会自动附带 Basic 认证，两者不冲突。
**不要**在这种情况下把 `assets/config.js` 的 `apiBase` 填成跨域地址——那会改用 Bearer 令牌，
覆盖 Basic 头并导致接口 401。等站点对访问者公开后，再考虑去掉 Basic Auth。
