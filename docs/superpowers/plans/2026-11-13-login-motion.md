# 动态登录页实施计划

按已批准设计在当前会话实施，使用 executing-plans 工作方式。

## 目标与技术

原生 HTML/CSS/JS 登录和注册页。设计依据为 ../specs/2026-11-13-login-motion-design.md。

## 约束

遵循根目录 AGENTS.md 与 docs/Codex协同指南.md，使用现有生产接口约定。本地审核阶段保留在 codex/login-motion 分支。

## 步骤

- [x] 添加浏览器回归检查，先验证居中布局与键盘登录方式切换测试失败。
- [x] 调整 login.html、register.html 与 assets/auth.css，保留现有接口和字段 ID，补齐动态切换与无障碍状态。
- [x] 运行浏览器检查，覆盖桌面、手机、减少动画、发码、登录失败及成功、注册和账号面板。
- [x] 执行 node scripts/build-pages.mjs，在本地 Pages + D1 + 短信 mock 模式验证完整注册登录和门禁。
- [x] 检查差异、敏感文件和本地截图，提供本地审核入口与结果。

## 重点检查

请求进行中重复提交或切换、验证码错误与重试、带 next 的页面访问、手机键盘焦点、减少动画模式。


## 验证记录

2026-11-13 完成 17 项真实本地 Pages+D1+短信 mock 检查，另完成 320、768、1024 宽度的 6 项布局检查。浏览器运行错误为 0，Pages 构建通过，git diff --check 通过。只读复核提出测试地址保护问题，已加入 loopback 和短信 mock 前置检查后重跑通过。本地预览保留于 http://127.0.0.1:8788/login。
