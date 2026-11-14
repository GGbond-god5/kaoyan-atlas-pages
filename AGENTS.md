# 协同工作约定（人类 + 多个 AI 代理）

这个仓库是「考研科目大观」**唯一的开发与部署源**。
如果你在另一台电脑上工作，请克隆这个仓库（`GGbond-god5/kaoyan-atlas-pages`）；
旧的 `GGbond-god5/kaoyan-atlas` 只保留历史，不再作为开发入口。

## 目录与部署

- 站点：`https://kaoyan-atlas-pages.pages.dev`
- Cloudflare Pages 项目：`kaoyan-atlas-pages`，生产分支 `master`
- 构建命令：`node scripts/build-pages.mjs`，输出目录 `dist`
- 推送 `master` 后 Cloudflare 自动构建部署；其他分支会生成预览部署
- **不要**用 `wrangler pages deploy` 直传，也不要改 Cloudflare 控制台里的项目设置；
  部署只走 GitHub push
- 环境变量（`SESSION_SECRET`、阿里云短信、`DASHSCOPE_API_KEY`）只在 Cloudflare 控制台维护，
  仓库里不放任何密钥

## 开始工作前

```bash
git pull --rebase origin master
git switch -c codex/<主题>        # 或 claude/<主题>
```

- 一个主题一个分支，完成后 push 分支并开 PR 到 `master`
- 不要 force-push `master`；不要在 `master` 上直接堆未验证的改动
- 合并前先 `git pull --rebase origin master`，冲突时保留双方意图，并在 PR 里说明取舍

## 内容与生成物

- `src/` 是内容源，`assets/*.js`、`web/*.js` 是生成物
- Pages 构建**只复制文件，不运行 Python**，所以生成物必须一起提交
- 构建脚本见 `docs/制作过程.md`；本机 Python 用 `py -3`，其他机器按环境替换
- 改动后本地自检：`node scripts/build-pages.mjs`，再 `npx wrangler pages dev .`（需要 Node 18+）

## 禁止提交

`bank/`、`.env`、`*.key`、`node_modules/`、`.wrangler/`、`.pages-deploy/`、临时截图目录。
`bank/` 是 16GB 的本地资料库，永远不进仓库。

## 避免互相覆盖

同时只让一个代理改同一块目录，按下面分工认领，跨目录改动在 PR 里写清楚：

| 目录/文件 | 负责范围 |
| --- | --- |
| `functions/`、`login.html`、`register.html`、`assets/auth*.js` | 账号、门禁、接口 |
| `src/`、`web/`、`assets/questions.js`、`assets/data.js` | 题库与知识点内容 |
| `*.html`、`assets/*.css`（auth 除外） | 页面与样式 |
| `scripts/`、`wrangler.toml`、`docs/` | 构建与部署 |

## 提交与验证

- 提交信息写清「为什么改」，不要只写「update」
- PR 描述里写：改了什么、怎么验证的、影响哪些页面
- 视觉改动附截图；接口改动附请求结果
- 两台电脑不要同时发布同一文件；先 pull，再改，再 push

## 分值规则

- 题目自带 `maxScore` 时一律以卷面分为准。
- 没有卷面分时，由 `functions/_lib/scoring.js` 按科目与题型分配：
  数学选填 5、大题 10–12；807 每题 15–25；英语/政治按现行试卷结构。
- 套卷会按官方总分配平：数学 150、807 150、英语/政治 100。
- 改分值规则只改 `scoring.js`，并用整卷样本验证总分，不要在各接口里另写一套默认分。

## 已知限制

- 单文件不超过 25 MiB，部署文件数不超过 20,000（当前约 2,100）
- 免费版 Functions 单次 CPU 10ms 左右，PBKDF2 迭代不要调高
- 站点要求登录，未登录只能访问 `/login`、`/register` 及其必要资源
- **R2 尚未开通**：`wrangler.toml` 里的 `LIBRARY_FILES` 绑定保持注释，资料上传接口返回 503；
  开通 R2 并创建 `kaoyan-atlas-library` 桶后再取消注释
- **AI 端点使用千问平台** `https://maas.qianwenaiapi.com/compatible-mode/v1`
  （`platform.qianwenai.com` 的 OpenAI 兼容接口，Key 沿用 `DASHSCOPE_API_KEY`）；
  不要改到其他中转或陌生域名
- `platform_*` 系列 D1 表由接口在首次调用时自动创建，不需要手工迁移
