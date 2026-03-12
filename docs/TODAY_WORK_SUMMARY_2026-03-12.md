# QuizAll 今日改动总结（给你看的版本）

## TL;DR
今天这一轮不是小修小补，是一次「产品结构 + 科学模块 + 视觉系统 + 后端兼容」的综合升级。

- 统计范围：`143bcee..HEAD`
- 总体变更量：`52 files changed, +10368 / -1735`
- 核心结果：
  - 完成 Science 模块从数据到页面到产品内触达的闭环
  - 建立项目制 Exam Prep 工作流（上传 -> 选题 -> mindmap -> quiz -> analytics -> science）
  - 重做首页/仪表盘视觉架构（特别是背景层、模式切换、对齐系统）
  - 修复关键后端稳定性问题（PG 占位符与内容回退逻辑）

---

## 1) 你关心的“这 1w 行到底做了什么”

按改动量最大的文件看：

- `frontend/create.html`：`+2156/-380`
  - 从单一出题页升级到项目化 Exam Prep Workspace
  - 引入 Step 式工作流、project tabs、mindmap 编辑与保存、science contextual panel

- `frontend/science/index.html`：`+2111/-0`
  - 新建完整 Science 公共页面
  - 包含 6-step pipeline、pull quote、过渡段、mindmap、对比图、CTA 等完整叙事

- `backend/src/routes/quiz.js`：`+1518/-175`
  - 项目系统 API（projects/files/exam-prep/mindmap/analytics/streak/history）
  - quiz 生成逻辑支持项目上下文和 source pack 回退

- `frontend/lib/scienceLocale.js`：`+793/-0`
  - Science 页面与相关文案的多语言（9 语种）扩展

- `frontend/quiz.html`：`+566/-234`
  - 会话/题目交互增强，与项目和科学模块联动

- `frontend/style.css`：`+523/-28`
  - 全局视觉系统改造（网格、光效、cursor、topbar、组件层级）

- `frontend/lib/scienceCommon.js`：`+512/-0`
  - 产品内 Science 交互基础设施（badge、modal、step grid、dismiss 持久化）

- `frontend/index.html`：`+505/-266`
  - Landing + logged-in dashboard 双态重构
  - 导航、hero、trust marquee、dashboard 区块层级与脚本逻辑更新

---

## 2) 功能层面完成了什么

### A. Science 能力（从“页面”升级为“系统”）
- 公共 `/science` 页面上线，且可深链到具体 step（便于 badge 跳转）。
- 产品内两种入口都完成：
  - 首页 widget（可打开 step 详情）
  - 项目内 Science tab（根据项目行为显示激活/未激活）
- 关键触发点 badge 已串联（上传、mindmap、quiz 完成、analytics 打开）。
- badge 支持 dismiss 持久化，避免打扰。

### B. Exam Prep 项目化工作流
- 引入 project 维度（一个考试/课程一个 project）。
- 支持 project files、outline candidates、exam topics、mindmap 的完整链路。
- quiz 和 history/analytics 可按 project 追踪。
- dashboard 有 study streak heatmap（跨项目活动密度）。

### C. 视觉与体验系统
- Light/Dark mode 联动增强（Science 页与主系统同步）。
- 网格背景、粒子、组件发光、按钮风格、导航交互做了大量迭代。
- 首页品牌区（高校信任滚动）升级为双行反向滚动，并替换重资源 logo。

### D. 后端稳定性修复
- 修复了 PG 参数占位符路径不一致导致的潜在启动问题。
- 优化 quiz 生成内容兜底：短内容场景也可走 source-pack 回退，减少 400。

---

## 3) 今天踩过的坑（最值得记住）

1. **背景层 owner 不清**
- 一开始把效果堆在全局 `body`，后续又加局部层，导致 light/dark 分层断裂、网格丢失、出现黑块。
- 教训：先确定“哪一层是 owner”，再改样式。

2. **topbar 样式冲突严重**
- `style.css` 里 topbar 规则非常多，且有大量 `!important`，容易“改了又被覆盖”。
- 教训：改 nav 前先全文件扫描 `.topbar`。

3. **登录态和落地页同渲染导致结构混乱**
- 用 `order` 交换视图顺序会让布局/背景边界互相污染。
- 教训：登录态页面问题优先把无关视图彻底隐藏。

4. **视觉改动太容易“牵一发而动全身”**
- 一个玻璃感、一个 cursor 特效、一个 grid 对比度，都可能引发连锁回归。
- 教训：每次改动都必须双主题截图验证。

---

## 4) 现在系统的状态（你可以放心的点）

- Science 模块：从内容、路由、组件、交互、翻译、主题都打通了。
- Dashboard：结构化分区、中心轴修正、背景层逻辑可维护性明显提升。
- 项目工作流：后端 API 和前端页面已经成体系，不是 demo 级拼接。
- 导航和全局 UI：主要视觉冲突点已经有清晰规则，不再完全“玄学”。

---

## 5) 给你的“下一步建议”（如果你愿意继续）

1. 做一次“小型冻结版”基线截图包（light/dark + 关键页面），作为视觉回归标准。
2. 把 `style.css` 的 topbar 重复规则做一次去重整理（技术债清理，收益很高）。
3. 对 `quiz.js` 做路由分拆（projects / generate / history / analytics），降低未来维护风险。

---

## 6) 关键提交索引（方便你回看）
- `5d4c7d8` 项目化工作流与大规模结构升级
- `8f3aa60` Science 模块首版完整接入
- `916eb72` Science 导航联动、marquee、cursor 调整
- `9a69e88` Science 页与视觉系统大修 + 多语言支撑
- `583b7bf` 后端兼容与生成兜底修复
- `25ffeec` 首页/仪表盘布局层重构

