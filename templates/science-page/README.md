# Science Page Template Kit (QuizAll Style)

> 目标：把今天验证过的 Science 页面工程化风格沉淀成可迁移模板，下一项目直接复用，不再从 0 开始。

## 1. 模板包含内容

- `science-page.template.html`
  - 页面骨架（Hero / Stage Rail / 6 Steps / Comparison Chart / Citations / CTA）
- `science-page.template.css`
  - 主题 token、背景网格与粒子、编辑部风格排版、Stage 导航样式、图表容器
- `science-page.template.js`
  - 主题同步、语言同步、step 渲染、Stage 激活联动、对比折线图交互（理论/实际切换 + 十字准星）
- `science-data.template.js`
  - 可直接替换的示例数据（6-step、引用、转场文本、图表数据）

## 2. 快速迁移步骤（新项目）

1. 拷贝整个 `templates/science-page/` 到新项目。
2. 重命名文件：
   - `science-page.template.html` -> `science/index.html`
   - `science-page.template.css` -> `science/science.css`
   - `science-page.template.js` -> `science/science.js`
   - `science-data.template.js` -> `science/science-data.js`
3. 在新项目全局确保有 `data-theme="light|dark"` 或 `localStorage.theme`。
4. 替换 `science-data.js` 中的文案与引用数据。
5. 运行页面，按第 7 节 QA 清单验收。

## 3. 数据契约（必须保持）

`window.scienceTemplateData` 关键字段：

- `meta`
  - `title`, `kicker`, `heroTitle`, `byline`, `summary`, `preface`
- `journals`: string[]
- `steps`: Step[]
  - `id`, `number`, `title`, `tagline`, `description`
  - `keyFindings`: string[]
  - `citations`: string[]
  - `quote?`: `{ text, author }`
  - `why`: `{ question, answer, operationalCue }`
  - `papers?`: `{ title, abstract, citation }[]`
- `transitions`: `{ [stepId]: { text, caption } }`
- `comparison`
  - `title`, `intro`
  - `datasets.theory`, `datasets.actual`
  - 每个 dataset 包含 `quizall`, `cramming`, `band`（数组长度一致）
- `cta`
  - `title`, `body`, `primaryLabel`, `primaryHref`, `secondaryLabel`, `secondaryHref`
- `fullCitations`: string[]

## 4. 今天迭代出的核心工程规则（可迁移）

### A. 主题系统与背景层级
- dark/light 必须与主系统同源，不单独维护一套 theme 状态机。
- 背景层统一顺序：
  1) base color
  2) glow gradients
  3) grid layer
  4) particles layer
- 禁止“额外灰蒙蒙遮罩层”覆盖 dark grid。

### B. Stage 导航（替代旧进度条）
- 左侧固定 Stage rail（Stage 1..6），点击滚动到对应 section。
- 滚动时自动高亮当前 Stage。
- 这比“Step 0x / 06 Current Stage”卡片更清晰、更行业化。

### C. 思维导图模块（MECE + 可读性）
- 单中心：`QuizAll Research Foundation`
- 6 个一级分支互斥且穷尽（MECE）
- 显式逻辑连接（用虚线箭头 + why 标签，不只是归属）
- light/dark 都要保持颜色可识别、边界可见
- 文案语言必须随系统语言切换

### D. 折线图模块（P3 规格）
- 极简坐标：去顶部/右侧边框
- 仅保留水平网格线，隐藏垂直网格线
- 末端直接标注曲线名称，取消传统 legend
- 支持理论值/实际值切换
- hover 十字准星 + tooltip
- 可加入阈值线（如 `Δ Retentivity`）与注释 callout
- 时间轴采用 log 感知映射，更贴近遗忘曲线

### E. 内容可读性模块
- Pull Quote：大号斜体 + 左侧装饰线
- “The Why” 必须有解释，不留视觉空白
- Expand Core Conclusion 列表要有编号与装饰，不做纯平列表

## 5. 性能约束（必须遵守）

- 优先 SVG + CSS，不引入重图形库。
- 动画低频、低透明层，避免高成本滤镜叠加。
- 大资源图片必须优化（例如 logo 仅使用小尺寸版本）。
- 页面长文默认静态渲染，交互只增量绑定必要事件。

## 6. 常见坑与避免方式

1. **背景断层**
- 原因：固定高度背景 + 内容滚动超出。
- 解法：让内容区自己拥有背景层，或使用 `background-attachment: fixed` 且避免局部覆盖层。

2. **导航对不齐**
- 原因：多个 `.topbar` 规则重复覆盖。
- 解法：先全文检索 `.topbar`，找最终生效规则，再改。

3. **light/dark 颜色漂移**
- 原因：局部硬编码颜色没有 token 化。
- 解法：全部走 CSS 变量，light 只覆写变量。

4. **交互看起来“修了但没修”**
- 原因：改了错误 owner（改子元素而非父容器层）。
- 解法：先确认 owner，再改样式。

## 7. QA 验收清单

- [ ] dark/light 切换时背景网格都可见，无黑块、无断层
- [ ] Stage rail 点击可跳转，滚动高亮正确
- [ ] Step 01 后思维导图存在，文字与当前语言一致
- [ ] 对比图支持模式切换与 hover 十字准星
- [ ] 末端直接标注曲线名称，无 legend
- [ ] Pull quote / The Why / Expand Core Conclusion 都正常渲染
- [ ] 页面在移动端不崩布局（Stage rail 自动收起）
- [ ] 页面无明显渲染卡顿

## 8. 推荐接入方式（生产）

- 数据层：
  - 将 `science-data.template.js` 替换为真实研究数据模块（只读来源，禁止运行时改写）
- 本地化层：
  - 对接你的 i18n 系统，保证 `meta/steps/transitions/comparison/cta` 全量可翻译
- 事件层：
  - 与主 App 埋点对接（`science_step_open`, `science_chart_mode_switch`, `science_cta_click`）

