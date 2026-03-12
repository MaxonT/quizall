# Exam Prep Workspace Template Kit (QuizAll Style)

> 目标：把 `create.html` 的核心工程经验提炼为可迁移模板，下个项目无需重走今天的迭代弯路。

## 1) 模板文件清单

- `exam-prep-workspace.template.html`
  - 页面结构骨架（Step 1-6 + tabs + modal + status）
- `exam-prep-workspace.template.css`
  - dark/light token、卡片系统、stage 导航、mindmap 编辑样式、analytics 图表容器
- `exam-prep-workspace.template.js`
  - 前端状态机、阶段导航高亮、mindmap 交互、analytics 折线图、science 激活映射
- `exam-prep-workspace.api.template.js`
  - API 适配层（可切换真实后端 / mock）
- `exam-prep-workspace.data.template.js`
  - 可替换的默认文案、图表、science steps 示例数据

---

## 2) 迁移步骤（新项目直接照做）

1. 拷贝 `templates/exam-prep-workspace/` 到新项目目录。
2. 重命名：
   - `exam-prep-workspace.template.html` -> `create.html`（或你的工作区页面）
   - `exam-prep-workspace.template.css` -> `create.css`
   - `exam-prep-workspace.template.js` -> `create.js`
   - `exam-prep-workspace.api.template.js` -> `create.api.js`
   - `exam-prep-workspace.data.template.js` -> `create.data.js`
3. 在 HTML 中把脚本引用改成新路径。
4. 将 API 适配层 `useMock: true` 改为 `false`，并实现真实后端路径。
5. 对接你自己的 auth、theme、i18n 系统。

---

## 3) 核心逻辑（必须保留）

### A. 项目制状态模型
- 单项目上下文（`selectedProjectId`）驱动：
  - 上传文件
  - outline 扫描
  - topics + mindmap
  - quiz 生成
  - analytics
  - science 激活状态

### B. Step 结构
- Step 1: Project Scope
- Step 2: Materials Upload
- Step 3: Topics + Mindmap
- Step 4: Quiz Session
- Step 5: Analytics
- Step 6: Science Journey

### C. Stage 导航（关键迭代结论）
- 左侧 `Stage 1..6` rail 点击跳转 + 滚动自动高亮
- 替代旧的 “Step 0x/06 Current Stage” 卡片式进度
- 优点：可扫描、可定位、可维护（industry-standard）

### D. Mindmap 逻辑
- 节点可编辑、可加子节点、可删节点（根节点至少保留 1 个）
- 数据结构：
  - `{ id, text, status, children[] }`
- 生成后可回写保存 API
- 语言与主题都必须可切换

### E. Analytics 折线图（今天的细化规范）
- 仅水平网格线，无垂直网格线
- 去顶部和右侧边框，保持极简
- 末端直接标注线名，替代 legend
- 支持理论/实际数据切换
- hover 显示十字参考线 + tooltip
- 支持阈值线（如 `Δ Retentivity`）

### F. Science Context 映射
- 行为 -> step 激活规则（默认）：
  - `filesUploaded` -> Step 01/02
  - `quizCompleted` -> Step 03/04
  - `mindmapGenerated` -> Step 05
  - `analyticsViewed` -> Step 06

---

## 4) 与后端对接契约（参考）

模板 API 层预留以下方法（见 `exam-prep-workspace.api.template.js`）：

- `listProjects()`
- `createProject(payload)`
- `getProjectDetail(projectId)`
- `saveFiles(projectId, files[])`
- `scanOutlineCandidates(projectId)`
- `generateMindmap(projectId, payload)`
- `saveMindmap(projectId, payload)`
- `generateQuiz(projectId, payload)`

如果接 QuizAll 当前后端，建议映射：
- `GET /api/quiz/projects`
- `POST /api/quiz/projects`
- `GET /api/quiz/projects/:id`
- `POST /api/quiz/projects/:id/files`
- `GET /api/quiz/projects/:id/outline-candidates`
- `POST /api/quiz/projects/:id/exam-prep`
- `PUT /api/quiz/projects/:id/mindmap`
- `POST /api/quiz/generate`

---

## 5) 今天踩坑总结（迁移时重点避雷）

1. **背景 owner 混乱导致断层**
- 必须定义清楚页面哪个容器拥有背景层，不能全局和局部重复叠加。

2. **light/dark 不一致**
- 所有颜色走 token，不要在组件里硬编码一套 light 色值。

3. **导航样式被多处覆盖**
- 大型 CSS 文件中存在重复规则时，先检索全局再改局部。

4. **“修了但看不见变化”**
- 多数是改错 owner（子节点而不是父布局节点）。

5. **交互迭代未沉淀**
- 每次产品迭代（比如 stage 展示形态变化）必须在模板里保留注释和开关，不要只改线上页面。

---

## 6) 性能约束

- 优先原生 SVG/Canvas/CSS，不引入重图表库。
- 动画保持低频与低层级滤镜，避免渲染压力。
- 上传解析建议异步+分批处理，避免主线程长阻塞。
- 大图标/Logo 必须优化后再用。

---

## 7) QA 清单（上线前）

- [ ] dark/light 切换无背景断层、无黑块
- [ ] Stage rail 点击跳转正确，滚动高亮正确
- [ ] Mindmap 新增/删除/编辑正常
- [ ] Analytics 图表切换与十字准星正常
- [ ] Science 激活文案与状态一致
- [ ] 移动端布局不崩（rail 自动收起）
- [ ] API 异常时 status 提示明确

