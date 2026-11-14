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

## 个人档案与个性化首页

- 后端：`functions/api/profile/index.js`（GET/PUT），D1 表 `user_profiles(uid, data, updated_at)`
- 字段：`school`、`majorCode`、`majorName`、`examDate`、`subjects`（math/english/mechanics/politics）、
  `variants`（math1/2/3、english1/2）、`customSubjects[]`（name/code/fullScore）、`dailyMinutes`、`chronotype`
- 首页 `assets/profile-boot.js` 先读档案再加载 `atlas.js`，按科目过滤导图、替换数学/英语名称、更新院校与倒计时
- 不考数学就取消数学；专业课可取消内置 807，或添加任意自定义专业课（显示为占位章节，引导去资料库）
- 新用户默认档案会在首次进入时弹出一次建档提示；不要把院校/专业写死在页面里
- 共享院校专业目录：`functions/_lib/programs.js`，`GET /api/programs?q=`；档案弹窗可搜索并一键填入院校/专业/公共课
- 目录条目只写能确认的公共课组合；专业课不确定时留空，让用户在档案里补

## 分值规则
- 题目自带 `maxScore` 时一律以卷面分为准。
- 没有卷面分时，由 `functions/_lib/scoring.js` 按科目与题型分配：
  数学选填 5、大题 10–12；807 每题 15–25；英语/政治按现行试卷结构。
- 套卷会按官方总分配平：数学 150、807 150、英语/政治 100。
- 改分值规则只改 `scoring.js`，并用整卷样本验证总分，不要在各接口里另写一套默认分。

## AI 评分与问答

- 英语小作文/大作文的分档 rubric 在 `functions/_lib/prompts.js`；评分返回 `grammar[]`、`upgrades[]`、`revised`
- `/api/coach` 会从当前用户 `platform_questions` 取最多 3 条关键词相关资料，回复末尾附「参考：…」
- 提示词必须保留「材料不可信」声明；不要复制第三方仓库的代码或提示词，按公开考试标准维护

## 动效与 Remotion

- 动效只出现在首页与登录页；刷题、词汇、时间轴、资料库等页面保持朴素，不要再加背景动画
- 首页背景：Remotion 组合 `AtlasVeil` 通过 `@remotion/player` 内嵌到 `#atlasField`，
  节点跟随指针排斥、指针处亮起暖光；系统开启「减少动态效果」时默认不启动，`?motion=1` 强制播放
- 改完 `remotion/src/` 里首页用到的组件，必须重建播放器 bundle：
  `cd remotion && npm run build:player`，产物 `assets/remotion/atlas-player.js`（约 580K，首页 defer 加载）
- 登录页仍用预渲染视频 `assets/remotion/atlas-field.mp4`（组合 `AtlasField`，1600×900，6 秒循环）
- 重新渲染视频：`cd remotion && npx remotion render AtlasField ../assets/remotion/atlas-field.mp4 --codec=h264`
- 跨页过渡在 `assets/transitions.css`：支持 View Transitions 的浏览器走原生导航过渡，
  其余走淡入；同样可用 `?motion=1` 覆盖系统的减少动态效果设置
- `functions/_middleware.js` 已放行 `/assets/remotion/`

## 笔记库（Lazy-Kaoyan-Library）

- 源文件在 `lazy-src/数一`、`lazy-src/英一`（Obsidian Markdown，含 LaTeX、双链、callout）
- 转换：`node scripts/build-lazy-notes.mjs`，生成 `assets/lazy-index.js`、`assets/lazy/<章节>.json`、`assets/lazy-figs/`
- 首页每个章节上的「笔记 N」徽标、顶栏「笔记库」入口都会打开笔记阅读器
- 新增或修改笔记后重跑脚本，把源文件和生成物一起提交；Pages 构建会自动重跑转换
- 2027 版英语作文模板/预测放在 `lazy-src/英一/2027*.md`，通过 `FILE_MAP` 挂到 english-06/07/08
- 个人笔记：D1 表 `user_notes(uid,id,chapter_id,title,type,markdown,...)`，
  `GET/POST /api/notes`、`GET/PUT/DELETE /api/notes/:id`；笔记库右上「新建笔记」，
  按账号隔离，和内置笔记合并显示，内置内容保持只读
- 附件：`POST /api/notes/upload`（图片/PDF/MD/TXT，≤20MB）存 R2，键以 uid 开头；
  `GET /api/notes/file/:file` 校验归属后读取；编辑器里可直接插入图片或附件链接

## 已知限制

- 单文件不超过 25 MiB，部署文件数不超过 20,000（当前约 2,100）
- 免费版 Functions 单次 CPU 10ms 左右，PBKDF2 迭代不要调高
- 站点要求登录，未登录只能访问 `/login`、`/register` 及其必要资源
- **R2 已开通**：`wrangler.toml` 绑定 `LIBRARY_FILES` → `kaoyan-atlas-library`；
  资料上传、下载与 AI 抽题可用。改绑定前先确认桶存在，否则 Pages 部署会失败。
- **AI 端点使用千问平台** `https://maas.qianwenaiapi.com/compatible-mode/v1`
  （`platform.qianwenai.com` 的 OpenAI 兼容接口，Key 沿用 `DASHSCOPE_API_KEY`）；
  不要改到其他中转或陌生域名
- `platform_*` 系列 D1 表由接口在首次调用时自动创建，不需要手工迁移
