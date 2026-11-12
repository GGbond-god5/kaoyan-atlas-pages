# Codex 协同指南

写给在另一台电脑上用 Codex 参与「考研科目大观」的代理。先读完这份，再读仓库根目录的 `AGENTS.md`。
两份内容一致，这份更详细。

## 1. 项目与线上环境

- 项目：考研科目大观，2027 华工 085500 备考用的静态站点 + 账号系统
- 唯一线上地址：`https://kaoyan-atlas-pages.pages.dev`
- 唯一开发与部署仓库：`GGbond-god5/kaoyan-atlas-pages`（私有）
- 旧仓库 `GGbond-god5/kaoyan-atlas` 已归档，只读，不要再改
- 旧站点 `kaoyan-atlas.pages.dev` 已下线
- 账号体系：手机号 + 阿里云短信验证码注册/登录，Cloudflare Pages Functions + D1
- 全站要求登录：未登录访问页面会 302 到 `/login`，静态资源与评卷接口返回 401

## 2. 哪些是源文件，哪些是生成物

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| 内容源 | `src/chapters/**/NN.json`、`src/bank/imported-*.json` | 章节、题目、解答的源数据 |
| 生成物 | `web/<id>.js` | 阅读包，`build_web.py` 生成 |
| 生成物 | `assets/data.js` | 图谱数据，`make_index.py` 生成 |
| 生成物 | `assets/questions.js` | 刷题数据，`build_questions.py` 生成 |
| 生成物 | `assets/papers.js` | 套卷档案，`build_papers.py` 生成 |
| 生成物 | `assets/vocab-data.js`、`assets/bank-catalog.js` | 词汇/题库索引 |
| 页面 | `*.html`、`assets/*.css`、`assets/*.js`（auth 除外） | 手写或生成 |
| 接口 | `functions/**` | Cloudflare Pages Functions |
| 部署 | `scripts/build-pages.mjs`、`wrangler.toml` | 只复制公开文件到 `dist/` |
| 本地资料 | `bank/` | 16GB，永不提交 |

**关键：Cloudflare 构建只执行 `node scripts/build-pages.mjs`，不会运行 Python。**
改了 `src/` 之后必须在本机跑生成脚本，并把 `assets/`、`web/` 的生成物一起提交，否则线上不会更新。

## 3. 常用构建命令

Windows 本机 Python 是 Store 别名，必须用 `py -3`；其他系统按环境换成 `python3`。

```bash
# 阅读包、PDF、图谱数据
py -3 src/build/build_web.py
py -3 src/build/build.py
py -3 src/build/make_index.py

# 题库
py -3 src/build/build_questions.py
py -3 src/build/classify_papers.py
py -3 src/build/build_papers.py

# 词汇 / 题库索引
py -3 src/build/build_vocab.py
py -3 src/build/build_bank.py

# KaTeX 公式校验
node src/build/katex_check.js
```

只改了页面或样式时，不需要跑 Python，直接提交即可。

## 4. 发布流程

- 向 `master` push 后，Cloudflare 自动执行 `node scripts/build-pages.mjs`，把 `dist/` 发布到线上
- 其他分支会生成预览部署，不影响线上
- 不要使用 `wrangler pages deploy` 直传，也不要改 Cloudflare 控制台的项目设置
- 环境变量只在 Cloudflare 控制台维护，仓库里不放密钥

## 5. 开发流程（必须遵守）

```bash
git clone https://github.com/GGbond-god5/kaoyan-atlas-pages.git
cd kaoyan-atlas-pages
git switch -c codex/<主题>
```

1. 开始前先 `git pull --rebase origin master`
2. 一个主题一个分支，完成后 push 分支，开 PR 到 `master`
3. 合并前再 `git pull --rebase origin master`，解决冲突后 push
4. 不要 force-push `master`
5. PR 描述写清：改了什么、为什么改、怎么验证、影响哪些页面
6. 视觉改动附截图；接口改动附请求结果

## 6. 分工与并发

同一时间只让一个代理改同一块目录。按下面认领，跨目录改动在 PR 里说明：

| 目录 / 文件 | 范围 |
| --- | --- |
| `functions/**`、`login.html`、`register.html`、`assets/auth*.js/css` | 账号、门禁、接口 |
| `src/**`、`web/**`、`assets/questions.js`、`assets/data.js`、`assets/papers.js` | 题库与知识点内容 |
| `*.html`、`assets/*.css`（auth 除外） | 页面与样式 |
| `scripts/**`、`wrangler.toml`、`docs/**` | 构建、部署与文档 |

两台电脑不要同时发布同一个文件。改之前先 pull；改完尽快 push，避免长时间分叉。

## 7. 环境与密钥

- 仓库里没有、也不要放：`.env`、AccessKey、`SESSION_SECRET`、任何 API Key
- Cloudflare 生产环境变量只有 6 个：`SESSION_SECRET`、`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_LOGIN_TEMPLATE_CODE`、`DASHSCOPE_API_KEY`
- 本地要跑 Express 备用后端时，复制 `server/.env.example` 为 `server/.env`，该文件已被 gitignore
- AI 评卷 Key 不能进浏览器；线上走 Pages Function，本地走 `serve.py`
- 用户数据库是 Cloudflare D1：`kaoyan-atlas-accounts`，不要连旧的 `kaoyan-atlas-auth`（表结构不同）

## 8. 本地验证

```bash
node scripts/build-pages.mjs
npx wrangler pages dev . --d1=DB
```

- 未登录访问 `/` 应 302 到 `/login?next=%2F`
- `/login`、`/register` 应返回 200
- `/assets/data.js` 未登录应 401
- 注册/登录后 `/`、`/practice`、`/vocab` 应 200
- 题库改动后跑 `node src/build/katex_check.js`
- 涉及短信时不要给陌生号码发码；用 `SMS_DEV_CODE=1` 的本地 mock 模式验证流程

## 9. 常见坑

1. **Pages 直传不读 `.assetsignore`**：本项目走 Git 构建，`scripts/build-pages.mjs` 只复制白名单目录，不要往 `dist/` 塞 `server/`、`docs/`、`src/`
2. **生成物必须提交**：只改 `src/` 不改生成物，线上不会变
3. **D1 旧表**：不要再绑定 `kaoyan-atlas-auth`，里面有一套不同的 `users` 表，会让接口一直报「数据库未就绪」
4. **Basic Auth 已移除**：旧的 `SITE_USER`、`SITE_PASS` 已删除，门禁改由账号会话承担
5. **单文件 25 MiB、部署文件数 20,000**：当前约 1,650 个文件，不要新增超大二进制
6. **免费版 Functions CPU 约 10ms**：不要把 PBKDF2 迭代调高
7. **`bank/` 只在本机**：不要试图提交或引用未经确认的版权资料

## 10. 当前状态（2026-11-12）

- 账号系统、登录门禁、短信注册登录已上线并通过真实手机号验证
- Git 自动部署已验证：push `master` → 约 20 秒完成构建
- 旧站点与旧 Cloudflare 项目已下线，旧仓库已归档
- 待办建议：轮换曾暴露的 AccessKey 与账号密码；如需按目录更细地分工，可在 PR 里约定
