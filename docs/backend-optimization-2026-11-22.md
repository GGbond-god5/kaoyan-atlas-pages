# 考研科目大观：后端与全栈工作流优化报告

**日期：** 2026-11-22  
**仓库：** `GGbond-god5/kaoyan-atlas-pages`  
**基线：** `f2b0152`（文档状态：计划卡批已上线）  
**工作分支：** `codex/backend-reliability`  
**范围：** 仅后端、后端测试、CI 与工程文档；未修改 `assets/**`、根目录 HTML 或任何前端脚本。

---

## 1. 执行摘要

本轮优化目标不是增加新页面，而是在不改变现有 API 契约和前端行为的前提下，修补后端在**安全边界、批改并发、数据清理、配置生命周期、分值不变量和回归工作流**上的结构性缺口。

已完成的关键改进：

1. 登录门禁从 fail-open 改为私有路径 fail-closed；补齐登录页 `theme.css` 白名单。
2. 增加会话版本号；改密后其他设备令牌立即失效，当前设备自动换发新令牌。
3. 注销账号时补齐社区表、点赞/评论关联数据和 R2 多前缀清理，并避免误删别人分享的 R2 对象。
4. 自带 AI 配置最多暂存 24 小时，交卷响应不再回显用户 API Key。
5. ECS worker 领取改为条件更新（compare-and-set），避免两个 worker 同时领同一套卷。
6. 增加单题批改租约，浏览器与 ECS worker 同时批同一题时只调用一次 AI。
7. 分值分配增加可诊断结果；显式分值超过科目总分时拒绝保存，避免静默写坏卷面。
8. 增加后端回归测试与 CI 独立 job；题库自动重建工作流增加 concurrency，避免并发回提交冲突。
9. `/api/auth/me`、改密和注销补齐会话版本/封禁校验；损坏 Cookie 不再造成公开接口 500。
10. 自选 AI 地址增加本机/内网 SSRF 拦截；社区导入文件在单文件删除路径也不再误删原分享者对象。

**结论：** 现有前端不需要改动，API 路径与主要响应字段保持不变。新增的冲突分支只在“重复批改/异常分值/数据库故障”等原本错误或不确定的场景触发。

---

## 2. 当前架构与关键数据流

| 层级 | 实现 | 说明 |
| --- | --- | --- |
| 静态层 | Cloudflare Pages | 根目录 HTML + `assets/` 生成物 |
| 边缘函数 | Pages Functions | `functions/_middleware.js` + `functions/api/*` |
| 核心平台逻辑 | `functions/_lib/platform.js` | 题目、资料、套卷、批改、教练、D1 schema |
| 算法层 | `functions/_lib/scoring.js`、`prompts.js` | 分值分配、AI 评分契约与提示词 |
| 数据库 | Cloudflare D1 | users、user_*、platform_* |
| 对象存储 | Cloudflare R2 | 资料库文件、笔记附件 |
| 异步执行 | 阿里云 ECS `atlas-worker` | 轮询 claim、逐题批改、回写 D1 |
| AI 通道 | OpenAI 兼容接口 | 文字与识图共用一个模型通道 |

### 2.1 交卷与批改路径

```text
浏览器交卷
  -> POST /api/attempts
  -> 服务端校验题目/作答并分配分值
  -> D1 platform_attempts 保存 attempt JSON
  -> 浏览器立即发起 /api/attempts/:id/grade
  -> ECS worker 同时轮询 POST /api/worker { action: "claim" }
  -> 两边竞争单题批改租约
  -> 仅租约持有者调用 AI
  -> platform_results 幂等写回
  -> 所有题目批完后写入 inbox 完成消息
```

关键设计原则：

- **attempt JSON 是现有前端契约**，不能为了后端优化随意更改字段名。
- **结果表是批改事实源**，attempt JSON 内嵌的 `results` 仅作为兼容副本。
- **批改必须幂等**：同一个 `(uid, attempt_id, question_id)` 只能产生一次有效 AI 调用。
- **旧数据必须可读**：新增字段均提供默认值或回退逻辑。

---

## 3. 已实施改动

### 3.1 登录门禁 fail-closed

文件：`functions/_middleware.js`

原逻辑在会话有效但 D1 查询异常时直接 `next()`，等于数据库故障时绕过封禁/注销校验。现改为：

- 公开路径继续放行。
- 私有路径必须完成会话与用户状态校验。
- D1 未绑定、查询异常或用户表不可用时返回 **503**，并提供 `Retry-After: 5`。
- 损坏 Cookie 按未登录处理，不泄漏为 500。
- `theme.css` 加入登录/注册页必要资源白名单。

**兼容性：** 正常登录用户行为不变；只有数据库故障时从“放行”变为“明确不可用”，这是安全上正确的取舍。

### 3.2 会话版本与改密下线

文件：`functions/_lib/security.js`、`functions/_lib/layer1.js`、`functions/api/auth/{login,register,password,me,delete}.js`、`functions/_middleware.js`

会话令牌新增 `sv`（session version）：

- 旧令牌没有 `sv` 时按 `0` 处理，因此部署瞬间不会让所有老用户掉线。
- 用户表新增 `session_version`，默认 0。
- 改密使用 `WHERE session_version = 当前值` 的条件更新，两个标签页并发改密时只有一个成功。
- 改密后版本加一，其他设备旧令牌立即失效；`/api/auth/me`、改密、注销都做二次校验，不只依赖中间件。
- 当前设备在改密响应中通过 `Set-Cookie` 换发新版本令牌，不会把自己也踢下线。
- 登录接口对封禁账号直接返回 403，避免“登录成功但随后处处 401”的循环。

**验收：** 两个浏览器登录同一账号，A 改密后 B 的 `/api/auth/me` 返回空用户、私有页面下一次请求返回 401；A 继续正常使用。

### 3.3 注销数据清理补全

文件：`functions/api/auth/delete.js`、`functions/_lib/object-keys.js`

新增清理：

- `platform_shares`
- `platform_wrongbook_exports`
- `platform_posts`
- `platform_share_likes` / `platform_share_comments`
- `platform_post_likes` / `platform_post_comments`
- `platform_grading_claims`

清理顺序：

1. 先按“我发布的分享/动态”删除其点赞与评论。
2. 再按 `uid` 删除我对他人的点赞/评论。
3. 最后删除本人主表记录和 users 行。

R2 清理覆盖：

- `library/${uid}/...`：资料库文件
- `${uid}/...`：历史目录式附件
- `${uid}-...`：当前笔记附件
- `avatars/${uid}`：头像对象

数据库侧还会匿名化 `platform_invites.used_by` 中的手机号，保留邀请码“已使用”状态。对象归属规则集中到 `functions/_lib/object-keys.js`：社区导入记录指向原分享者的 R2 对象，导入者注销或删除该导入记录时都不能删除原对象。单文件删除路径 `functions/_lib/platform.js` 复用同一规则；社区取消分享会事务性清理点赞与评论。

### 3.4 自带 AI 配置 24 小时 TTL

文件：`functions/_lib/platform.js`

原实现把用户自带 API 配置写进 attempt JSON，批完才删除；任务卡死时密钥可能长期留在 D1。现在：

- 交卷时写入 `aiCfgAt`。
- 读取时若超过 24 小时，自动从 attempt JSON 删除 `aiCfg` 与 `aiCfgAt`。
- 旧数据没有 `aiCfgAt` 时回退到 `createdAt`。
- 到期后 worker 自动降级到站点内置 AI 与配额。
- 交卷响应不再回显 `aiCfg` / `aiCfgAt`。

**注意：** 这不是完整密钥托管方案。用户 API Key 仍会在交卷请求体中经过边缘函数；若要彻底避免落库，应改造成短期加密票据或让浏览器直接调用用户指定的 AI 端点。但后者需要前端配合，不在本轮“不碰前端”的范围内。

### 3.5 ECS worker 原子领取

文件：`functions/_lib/platform.js`

原 claim：

```sql
SELECT uid,id,data FROM platform_attempts ORDER BY rowid ASC LIMIT 200
```

问题：

- 已完成记录永久占据最旧 200 条窗口。
- 读取完整 attempt JSON 后先判断再写 lease，多个 worker 存在竞争窗口。
- 无 `serverGrade`、未通知、租约过期等过滤条件，扫描浪费。

现逻辑：

- SQL 过滤 `json_valid(data)`、`serverGrade=1`、未通知、租约已过期。
- 仍按最早提交优先。
- 使用 `UPDATE ... WHERE data = 原值` 做 compare-and-set。
- 通知完成消息也先 CAS 打戳，再写 inbox，避免重复通知。
- 过期的 `aiCfg` 在 claim 时清除。

**兼容性：** attempt JSON 和 worker 接口协议不变。

### 3.6 单题批改租约

文件：`functions/_lib/platform.js`

新增 D1 表：

```sql
platform_grading_claims(
  uid,
  attempt_id,
  question_id,
  owner,
  expires_at,
  PRIMARY KEY(uid, attempt_id, question_id)
)
```

浏览器 `attemptGrade` 与 ECS worker `grade` 都必须先取得同一道题的租约：

- 浏览器拿到租约后调用 AI。
- worker 拿不到租约时返回 `blocked`，由 worker 释放套卷，避免重复调用。
- 浏览器拿不到租约时最多等待 30 秒；期间若对方写回结果，直接返回该结果。
- AI 调用失败会释放租约，允许重试。
- 租约 5 分钟自动过期，覆盖单题模型链最大耗时。

**前端兼容性：** 正常路径响应字段不变；极端冲突在等待后返回 409，前端现有错误处理会显示为可重试错误，不会伪造“批改完成”。

### 3.7 分值分配不变量

文件：`functions/_lib/scoring.js`、`functions/_lib/platform.js`

保留 `allocatePaper()` 旧契约，新增 `allocatePaperDetailed()`：

- 返回 `scores`、`assigned`、`total`、`missing`、`issues`。
- `issues[].fatal=true` 时接口拒绝保存。
- 显式分值合计超过科目总分时返回 400，不再静默接受。
- 数学、材料力学仍按原有区间分配，不改变绝大多数现有卷面的默认分值。
- 英语、政治题型结构不匹配 100 分时产生非致命告警，供后续管理端或日志观测。

**设计取舍：** 不自动缩放英语/政治分值，因为缩放会改变既有题目的官方卷面分，属于产品决策，不应由后端静默完成。

### 3.8 工程工作流

文件：`package.json`、`.github/workflows/validate.yml`、`.github/workflows/build-questions.yml`

新增：

```bash
npm run test:backend
```

覆盖：

- `tests/scoring.mjs`：分值不变量
- `tests/backend-hardening.mjs`：门禁、会话版本、worker claim、浏览器/worker 跨通道单题租约、AI 配置 TTL、SSRF、注销清理
- `tests/platform-api.mjs`：平台 API 主流程
- `tests/multi-image.mjs`：多图作答与批改契约
- `tests/user-state.mjs`：状态冲突合并与账号隔离

CI：

- `validate` 增加独立 `backend` job，使用 Node 24 运行后端测试。
- `validate` 增加 concurrency，同一 ref 的新运行取消旧运行。
- `build-questions` 增加 concurrency，避免两次题库重建同时向 master 回提交。

### 3.9 自选 AI 地址与对象归属安全边界

文件：`functions/_lib/platform.js`、`functions/_lib/object-keys.js`、`functions/api/grade.js`

- 自选 AI 接口必须是公网 `https://` 地址；拒绝 localhost、私网 IPv4、IPv6 ULA/链路本地、云元数据地址和 `.local/.internal/.lan` 等内网域名。
- 地址不能带 username/password、query 或 hash，避免 URL 解析歧义。
- 本地联调只有显式设置 `ALLOW_LOCAL_AI=1` 时，才允许 localhost / 127.0.0.1 / ::1 的 http 地址。
- 这是应用层 SSRF 防护，不能防御 DNS rebinding；高安全场景应再加出站域名 allowlist 或独立出口代理。
- R2 归属判断抽成单一函数，注销、单文件删除和社区导入共用，避免两条删除路径的安全语义漂移。

---

## 4. 测试与验收

本地已执行：

```bash
npm run test:backend
npm run check
npm run build
```

结果：

```text
scoring invariants passed
backend hardening checks passed
platform API checks passed
multi-image checks passed
user-state conflict, queued changes and account isolation passed
```

额外约束检查：

```bash
git diff --name-only | findstr /R "^assets/ .*\.html$ .*\.css$"
```

应无输出，表示前端文件零修改。

### 建议上线后人工验证

1. 未登录打开 `/login`、`/register`，样式完整，无 401。
2. 私有页面在数据库正常时可访问；模拟 D1 故障时返回 503，而不是放行。
3. 两台设备登录同一账号，A 改密后 B 自动退出。
4. 交卷后浏览器与 ECS worker 同时存在时，结果只出现一次，AI 调用量不翻倍。
5. 注销含社区互动、资料导入、笔记附件的账号后，数据库无残留，其他用户的共享文件仍可下载。
6. 构造显式分值超过 150/100 的套卷，接口返回 400。

---

## 5. 仍需继续优化的部分

以下项目风险或改动面较大，建议在下一阶段单独立项，不要与本次修复混在一起。

### P0：拆分 platform.js，建立后端模块边界

现状：`functions/_lib/platform.js` 仍同时承担 schema、鉴权、资料库、套卷、批改、教练、AI 调用和 worker 协议等多类职责，后续改动容易产生隐形耦合。建议采用“纯搬迁、不重写”的方式渐进拆分：

```text
functions/_lib/platform/
  schema.js          # 表结构与幂等迁移
  errors.js          # 稳定错误码与 HTTP 映射
  attempts.js        # 交卷、读取、删除、结果聚合
  grading-claims.js  # 单题租约
  grading-service.js # AI 批改、结构化校验、结果落库
  library.js         # 资料、抽题、导入
  coach.js           # 教练与深度解析
  index.js           # 薄 dispatcher，只做参数解析与路由
```

迁移顺序：

1. 先抽 `schema.js` 与 `errors.js`，保持所有导出路径和响应字段不变。
2. 再抽 `grading-claims.js` 与 `grading-service.js`，用现有跨通道租约测试作为安全网。
3. 用依赖注入传入 `{ db, env, uid, now }`，禁止新模块直接读取隐式全局状态。
4. 每个模块只暴露一个深接口，例如 `gradeQuestion(ctx, input)`，而不是把 SQL 细节散到路由层。
5. 只有在新模块覆盖率稳定后才删除旧函数；不要一次性重写。

### P0：作答图片从 D1 迁移到 R2

现状：

- 前端把图片压成 data URL 随 attempt JSON 提交。
- 后端把图片内嵌在 D1 attempt JSON 中。
- 单题最多 6 图，合计约 19.6M 字符，导致 D1 行体积、查询延迟、备份成本和 worker 读取成本偏高。

推荐方案：

1. POST `/api/attempts` 接收 data URL 后校验大小和 MIME。
2. 上传 R2，键使用 `attempts/${uid}/${attemptId}/${questionId}/${index}.webp`。
3. D1 只保存对象键、MIME、大小和摘要。
4. `attempt()` 读取时按需从 R2 取回并组成 data URL，保持前端看到的响应结构不变。
5. 删除 attempt、注销账号、批改完成清理都同步删除对象。
6. 增加 R2 失败回退：上传失败时保留 base64 并记录指标，避免交卷直接失败。

验收：

- 前端零改动。
- 同一份 JSON 在 D1 的体积下降 90% 以上。
- 浏览器仍能显示原图，worker 仍能识图批改。
- 断网/重试不产生重复对象。

### P1：独立批改任务表与可观测性

当前 worker 依赖 attempt JSON 属性扫描，正确性已由 CAS 保证，但大规模下仍缺少可查询的任务状态。建议新增：

```sql
platform_grading_jobs(
  uid, attempt_id, state, priority, attempts, last_error,
  claimed_by, claimed_until, created_at, updated_at
)
```

收益：

- 可按 state/时间建索引，不再扫描 attempt JSON。
- 可观测排队时长、失败率、租约冲突率、单题重试次数。
- 可做 dead-letter 和人工重放。
- worker claim 与通知逻辑可进一步简化。

### P1：把 AI 批改契约做成可验证的协议

当前已经对客观题做确定性复核，但主观题仍主要依赖“提示词 + 宽松 JSON”。建议进一步收口：

1. 定义固定 JSON Schema：`score`、`maxScore`、`breakdown[]`、`dimensions{}`、`confidence`、`missing[]`。
2. 校验 `0 <= score <= maxScore`、明细分之和与总分一致、维度值在允许区间；不合法先重试一次，仍失败返回 502，而不是写入 `pending`。
3. 结果中保存 `promptVersion`、`gradingVersion`、`model` 与 `gradedAt`，用于缓存失效和回溯。
4. 客观题继续以参考答案为准，不让模型覆盖确定性判分。
5. 为每类题型建立固定评测集，改提示词或模型后先跑离线回归，再上线。

### P1：统一错误码与日志字段

建议在 `platform.js` 中把高频错误映射为稳定错误码，例如：

- `AI_NOT_CONFIGURED`
- `GRADE_CLAIMED`
- `PAPER_SCORE_EXCEEDED`
- `DB_UNAVAILABLE`
- `IMAGE_TOO_LARGE`

日志至少包含：

- `requestId`
- `uid` 的哈希或短前缀
- `action`
- `attemptId`
- `questionId`
- `durationMs`
- `upstreamStatus`
- `errorCode`

不要把用户 API Key、完整手机号、data URL 写入日志。

### P2：D1 指标与索引审计

建议对以下查询建立长期观测：

- `platform_attempts WHERE uid=?`（已有主键前缀）
- `platform_results WHERE uid=? AND attempt_id=?`（已有主键前缀）
- `platform_questions WHERE uid=?`
- `platform_files WHERE uid=?`
- 社区 feeds、点赞计数、评论计数

根据真实慢查询再补索引，不要凭感觉一次加满。

### P2：备份与灾难恢复演练

确认：

- D1 导出可恢复。
- R2 对象生命周期策略不会误删共享文件。
- 注销删除脚本有审计日志。
- 批改结果可从 D1 备份和 R2 图片重放。

### P2：把全栈交付流程固化为闸门

建议按以下顺序交付，避免“代码已上线但迁移/worker 未同步”：

| 阶段 | 必做检查 | 失败处理 |
| --- | --- | --- |
| 本地提交前 | `npm run test:backend`、`npm run check`、`npm run build`、前端零改动检查 | 阻断提交 |
| PR | `validate` 的 check + backend 两个 job 全绿 | 阻断合并 |
| 预发布 | Pages Preview + D1 备份 + 环境变量核对 | 阻断发布 |
| 数据库 | 先执行仅新增表/列/索引的兼容迁移 | 不删除旧列，保留回滚空间 |
| 应用发布 | 先 Pages Functions，再升级 ECS worker；两者协议保持向后兼容 | worker 可回滚到旧版 |
| 发布后 15 分钟 | 登录、`/api/auth/me`、交卷、单题批改、worker claim、注销冒烟 | 超阈值回滚 |
| 回滚 | Pages 版本回滚；D1 不做破坏性回滚 | 用兼容代码读旧数据 |

监控至少覆盖：5xx 比例、登录失败率、`GRADE_CLAIMED` 冲突率、worker 队列深度、AI P95 延迟、单题重试次数、R2 删除失败数。日志中禁止出现 API Key、完整手机号、Cookie、作答图片 data URL。

---

## 6. 给下一位 AI 的交接提示

如果你要继续优化，请先遵守以下边界：

1. **不要改前端文件**，除非用户明确解除限制。前端入口包括 `assets/**`、根目录 HTML/CSS、`practice.js`、`plan.js`、`review.js`、`analytics.js`。
2. **不要改变现有 API 路径与主要响应字段**。需要增加字段时保持向后兼容。
3. **不要让旧 token 在部署瞬间全部失效**。新增会话字段必须按 0 回退。
4. **不要把批改失败伪装成完成**。冲突应返回可重试错误或等待真实结果。
5. **不要删除旧表或执行不可逆迁移**。优先加表、加列、加兼容分支。
6. **不要直接操作 ECS 或 Cloudflare 控制台**。部署走 GitHub；ECS 运维走阿里云云助手。
7. **每次改动后运行** `npm run test:backend`、`npm run check`、`npm run build`，并确认 `git diff` 没有前端文件。

推荐下一项任务顺序：

1. `platform.js` 模块化，先抽 grading 与 schema。
2. 作答图片 R2 迁移（先做兼容层，保留 base64 回退）。
3. 批改任务表、AI 结构化契约与指标。
4. 统一错误码、结构化日志与 D1 慢查询审计。
5. 备份恢复与发布回滚演练。

---

## 7. 变更文件清单

后端：

- `functions/_middleware.js`
- `functions/_lib/db.js`
- `functions/_lib/layer1.js`
- `functions/_lib/platform.js`
- `functions/_lib/scoring.js`
- `functions/_lib/security.js`
- `functions/_lib/object-keys.js`（新增）
- `functions/api/auth/delete.js`
- `functions/api/auth/login.js`
- `functions/api/auth/me.js`
- `functions/api/auth/password.js`
- `functions/api/auth/register.js`
- `functions/api/community/index.js`
- `functions/api/grade.js`

测试：

- `tests/backend-hardening.mjs`（新增）
- `tests/scoring.mjs`（新增）
- `tests/platform-api.mjs`（修正测试夹具）

工作流：

- `package.json`
- `.github/workflows/validate.yml`
- `.github/workflows/build-questions.yml`

文档：

- `docs/backend-optimization-2026-11-22.md`（本报告）
- `docs/全栈工作流.md`
- `docs/CHANGELOG-2026-11-15.md`
- `AGENTS.md`

**前端变更：无。**
