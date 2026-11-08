# 单份模拟卷逐题录入 · 子代理执行规范

与 `docs/agent-batch-brief.md` 相同，只改以下几处：

## 输入
- 该份试卷的连续 5 页（或实际页数）题页图，路径由主会话在任务里给出。
- 原卷 PDF 路径同样由主会话给出，只用于确认页码，不要整本读。

## JSON 字段差异
- `chapter`: `math-mock-<卷种>-<序号>`，例如 `math-mock-lilin6-2026-1`
- `chapterTitle`: `2026 李林六套卷（一）` 这类可读名
- `year`: 模拟卷年份字符串，如 `"2026"`
- `source`: `2026 李林六套卷（一）`
- `id`: `math-mock-<卷种>-<序号>-<题号>`
- `pageImage`: 该份试卷的题页图路径
- `isReal`: `true` 仍保留（表示原卷原题），同时加 `"isMock": true`
- `sourcePdf`: 模拟卷试题 PDF 路径
- `sourcePage`: 该题在该 PDF 中的实际页码

其余：22 题、10 选择 + 6 填空 + 6 解答、5–8 步解答、LaTeX 要求、自检命令全部与 `agent-batch-brief.md` 相同。
