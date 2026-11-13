# 个人资料库与考研测评设计

用户选择 Cloudflare Pages、D1 与私有 R2，并授权在本地实现资料上传、个人题库、反馈、题库校核、图谱刷题、套卷测评、作文指导及词汇提示。页面沿用大观既有配色与排版。本地审核后推进 GitHub PR 与 Cloudflare Git 发布。

## 已确认的实现选择

文件保存在私有 R2，元数据、个人题目、作答、测评和对话保存在 D1。所有查询从服务端会话取 uid，按所有者过滤。题库导入 skill 复用当前入库契约，来源页和待核状态随题保存，用户确认抽题草稿后加入个人题库。

AI 服务使用千问 OpenAI 兼容地址 `https://maas.qianwenaiapi.com/compatible-mode/v1`。默认模型采用现有功能使用的 `qwen3-vl-plus`，由服务端 `AI_MODEL` 覆盖。密钥来自 `AI_API_KEY`，兼容已有 `DASHSCOPE_API_KEY`。`AI_BASE_URL` 可覆盖服务端地址。页面中展示调用状态与失败重试。

资料上传支持 PDF、PNG、JPEG、WebP、TXT、Markdown、JSON。每个文件上限 20 MiB。浏览器提取 PDF 文字，扫描页渲染为图片，按页调用视觉抽题。服务端按来源保存草稿，用户确认后批量导入。文件上限、处理进度与选页范围在上传界面说明。

反馈窗口填写类型、内容和可选联系方式，生成发往 `15398831795@163.com` 的邮件，用户点击发送后由本机邮件客户端处理。该选择沿用用户要求的邮箱链接形式。

## 页面与交互

- 顶栏提供“我的资料”和“意见反馈”。资料页列出本人的文件和题目，可查看原文件、抽题、审阅草稿并加入题库。
- 图谱考点跳转到刷题页，传入 subject、chapter、kp，保留难度筛选。科目分别为 math、math2、english、english2、mechanics、politics。
- 练习支持公共题库、个人题库和合并范围。知识点模式保留解析与单题 AI 功能。
- 套卷和能力自测答题期间隐藏解析、原解析链接、AI 批改与相关快捷键。交卷后按题批改，显示已完成题数、分数与待核项，失败题可重试。结果题号均可回顾并查看解析和 AI 反馈。
- 能力自测要求选定单一科目，跨该科目知识点分层抽题，按题量随机选择，同一卷所有题 subject 相同。
- 结果窗口绘制六边形能力图和知识点掌握图，显示实际覆盖题量和得分依据。没有数据的维度显示待评估。单题分值从原卷提取，缺分值题显示待核分，结果保留已得分与已核满分范围。
- 翻译、大小作文支持 AI 批改与多轮跟进，作文图谱和测评结果页可打开相应个人对话。
- 所有词汇自测模式均提供灯泡提示，显示当前单词与释义。本题提示后可继续作答，正确率统计区分提示辅助结果。

## 数据隔离与兼容

复习与词汇缓存键、照片 IndexedDB 名称均带 uid。云端状态按 uid 和 namespace 保存，更新携带 revision，冲突时合并本次变更并重试。已有无归属浏览器记录由当前用户主动选择导入。

R2 key 由服务端生成，文件下载经受认证的 Function 返回。抽题输入作为待处理资料，AI 输出经过结构校验，页面以文本或受控公式渲染。重试导入按文件和草稿题 ID 去重。测评同一题的重复批改更新同一记录，避免重复累计总分。

## 后端与前端契约

所有 JSON 响应沿用 `{ok:true,...}` 或 `{ok:false,error}`。

| 接口 | 输入 | 输出 |
| --- | --- | --- |
| GET /api/library | 无 | `{files:[{id,name,subject,size,status,createdAt}]}` |
| POST /api/library | multipart file、subject、name | `{file}` |
| GET /api/library/:id | 无 | 本人文件流 |
| POST /api/library/:id/extract | `{pages:[{page,text,image?}]}`，每次处理少量页 | `{items:[questionDraft]}`，草稿带 draftId、sourcePage |
| POST /api/library/:id/import | `{items:[questionDraft]}` | `{items:[personalQuestion],imported}` |
| GET /api/personal/questions | 无 | `{items:[question]}`，题目字段沿用 QUESTIONS |
| GET /api/state/:namespace | namespace 为 practice 或 vocab | `{data,revision}` |
| PUT /api/state/:namespace | `{data,revision}` | `{data,revision}`，冲突返回 409 与最新 data、revision |
| POST /api/attempts | `{id,subject,mode,questions,answers}` | `{attempt}`，questions 为完整题目快照，answers 按题目 id 保存 work、selected、image |
| GET /api/attempts/:id | 无 | `{attempt}` |
| GET /api/attempts | 无 | `{attempts}` |
| POST /api/attempts/:id/grade | `{questionId}` | `{result,attempt}`，result 包含 questionId、score、maxScore、comments、missing、suggestions、revised、dimensions、status |
| POST /api/coach | `{conversationId?,context,messages}` | `{reply,conversationId}` |
| GET /api/coach/:id | 无 | `{messages,context}` |

`attempt` 至少包含 id、subject、mode、questions、answers、results、status、createdAt。results 按 questionId 映射。`question` 至少沿用 id、subject、chapter、chapterTitle、kp、kpName、kind、difficulty、text、answer、steps，并支持 maxScore、topicChapter、sourcePage、passage、reviewStatus。subject 必须与整卷相同。

共享前端 `window.AtlasUser` 提供 ready Promise、user、key(name)、load(namespace,fallback)、save(namespace,data)、json(path,method,body)。practice 与 vocab 等待 ready 后加载个人状态。load/save 负责用户缓存、云端 revision 和冲突处理。

## 题库校核与导入

以 docs/audit/2026-11-13-题库盘点与实施范围.md 为起点，优先补齐缺答案、解析，修正原卷题号、科目、真题模拟卷标记及单题分值。每题保留原页、修订依据和校核状态。数学与材料力学需要独立推导，英语需原文定位，政治需检查题目所属年度和来源。AI 校核遇到缺条件、图示不清或参考冲突时保留待核状态。

按用户指定范围扩充数二、英二和 2026 年真题。英二从 2010 年开始。材料力学排除 2019 年。数二模拟卷限定 2025、2026 年指定系列。

## 验证

本地 Pages+D1+R2 验证两账号相互隔离、文件鉴权、草稿确认与重试、状态冲突、单科组卷、交卷前解析封闭、交卷后完整回顾、评分累计与重试、对话归属、词汇提示、反馈邮件链接。先使用可复现 AI 夹具验证状态流程，再以真实千问接口验证抽题与批改。内容变更后执行对应 Python 生成器、KaTeX 检查与 Pages 构建。
