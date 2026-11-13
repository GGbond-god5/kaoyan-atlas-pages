# 个人资料库与考研测评实施计划

按 ../specs/2026-11-13-study-platform-design.md 实施。执行技能为 subagent-driven-development，当前独立克隆与 codex/study-platform 分支保留此前登录页。

## 全局要求

遵循根 AGENTS.md 与 docs/Codex协同指南.md。所有私有数据均从服务端会话确定归属。密钥使用服务端环境。src 更改运行相应生成器并包含 assets 与 web 生成物。页面沿用既有纸感 UI。本地审核先于 Git 发布。

## 任务与负责文件

- [ ] Task 1，后端与运行时导入 skill。负责 functions/**、skills/**、tests/platform-api.mjs。实现设计中的 API、D1 表、私有 R2、AI 客户端、单题评分和对话。验证隔离、结构校验、失败重试、批改幂等。
- [ ] Task 2，测评与图谱入口。负责 practice.html、assets/practice.js、assets/practice.css、assets/atlas.js、assets/assessment.js 与对应测试。实现图谱筛选、单科自测、交卷封闭与回顾、批改进度、评分、图表及作文指导。使用 Task 1 API 和 Task 3 AtlasUser 契约。
- [ ] Task 3，个人资料页、公共用户状态、反馈与词汇提示。负责 library.html、assets/library.js、assets/library.css、assets/user-state.js、assets/site-tools.js/css、vocab.html、assets/vocab.js、assets/vocab.css 与对应测试。实现浏览器 PDF 提取、资料上传、草稿确认、个人记录与反馈窗口，词汇各模式提示。使用 Task 1 API。
- [ ] Task 4，题库校核与扩充。负责 src/**、assets/questions.js、assets/papers.js、assets/data.js、assets/bank-catalog.js、web/**、docs/audit/**、scripts/内容工具。保留逐题来源与变更依据，优先补漏与既有答案勘误，再扩充指定科目年度和模拟卷。
- [ ] Task 5，整合与验证。主代理负责其余页面脚本接入、scripts/build-pages.mjs、wrangler.toml、.gitignore、运行环境、集成回归、截图和最终审阅。验证跨模块接口、生成物、资源门禁、两账号数据隔离和本地完整流程。

## 审阅重点

同一私有资源跨账号读取或写入、同卷混科、交卷前通过按钮或快捷键泄露解析、失败重试重复导入或累计评分、云端更新冲突丢失记录，以及 AI 输出格式错误或来源不清时的状态反馈。

## 执行记录

已有盘库结果包含 4,662 题，详细缺项在 docs/audit。用户已确认 D1+R2，并提供千问平台地址，官方文档已确认接口，默认模型由实施者沿用 qwen3-vl-plus。
