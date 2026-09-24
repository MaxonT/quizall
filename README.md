# QuizAll

**Languages:** [English](#english) · [中文](#中文-zh-cn) · [Español](#español) · [Français](#français) · [日本語](#日本語) · [한국어](#한국어) · [العربية](#العربية) · [Português](#português) · [हिन्दी](#हिन्दी)

---

<a id="english"></a>

## English

AI-powered study sessions: turn notes, files, or YouTube into a **study plan → Training/Testing quiz → review note**.

Paste text, upload PDF/DOCX, or drop a YouTube URL. QuizAll builds a structured plan, runs retrieval practice (Training) or mixed exams (Testing), then writes a study note you can share or revisit.

### Try the hosted app (no API key setup)

If you just want to use QuizAll, open the live site — no local install, no Anthropic API key required:

**https://quiz-all.com/**

The sections below are for running or developing the project yourself.

### Quick start (local)

#### 1. Backend

```bash
cd backend
cp ../.env.example ../.env   # set JWT_SECRET + ANTHROPIC_API_KEY at minimum
npm install
npm run dev                  # http://localhost:8080 (runs migrations on start)
```

#### 2. Frontend

```bash
cd frontend
python3 -m http.server 4173
```

Open `http://localhost:4173/index.html`. On localhost, `frontend/config.js` points the API at `http://localhost:8080` automatically.

#### 3. E2E (mocked API — backend not required)

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

### What you can do

| Feature | What it does |
|---------|----------------|
| **Study Chat** | Main workspace: plan → quiz → note in one flow (`create.html`) |
| **Material ingest** | Paste text; upload PDF / DOCX / text files; fetch YouTube captions |
| **Study plan** | AI-generated topics and steps from your materials |
| **Training mode** | Short MCQ batches, often focused on weak topics |
| **Testing mode** | Mixed-question exams with type mix and exam presets (general / finals / AP) |
| **Exam map** | Topic tree with mastery coloring (rule-based, not LLM) |
| **Study note + share** | Session summary; shareable link / challenge deep-link |
| **Wrong-answer review** | Spaced-repetition style queue for missed questions |
| **Study streak** | Activity streak with timezone-aware day boundaries |
| **Credits** | Per-action usage metering with daily reset |
| **Auth** | Email/password + Google / GitHub OAuth (PKCE) |
| **Classroom** | Classes, assignments, submissions (`classroom.html`) |

Subscriptions/Stripe code exists but is **off by default** (`SUBSCRIPTIONS_ENABLED=false`).

### Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Static HTML / CSS / JS (no bundler) |
| Backend | Node.js ESM + Express |
| Database | SQLite locally; PostgreSQL when `DATABASE_URL` is set |
| Auth | JWT + bcrypt; Google / GitHub OAuth PKCE |
| AI | Anthropic Claude (default model `claude-sonnet-4-6`) |
| Billing | Stripe (optional / feature-flagged) |
| Deploy | Render (`render.yaml`: static frontend + Node API + Postgres) |
| E2E | Playwright (mocked API) |

### Architecture (short)

```
Browser (static frontend)
    │  fetch + Bearer JWT (authGuard)
    ▼
Express /api/*  (auth, oauth, quiz, classroom, billing, analytics)
    │
    ├─► dbHelpers → SQLite or PostgreSQL
    ├─► Anthropic Claude (study-plan / quiz / note)
    └─► Stripe (optional)
```

**Core learning API** lives under `/api/quiz`.  
**Product state** for the main flow is driven by `frontend/create.js` plus `frontend/create/` helpers.

For agent/contributor conventions, see [`AGENTS.md`](AGENTS.md).

### Main pages

| Path | Purpose |
|------|---------|
| `frontend/index.html` | Landing / login |
| `frontend/create.html` | Study chat workspace |
| `frontend/projects.html` | Project folders |
| `frontend/history.html` | Past sessions |
| `frontend/library.html` | Saved materials |
| `frontend/classroom.html` | Teacher / class flows |
| `frontend/share.html` | Shared session view |
| `frontend/subscription.html` | Plans & billing UI |
| `frontend/settings.html` | Account settings |
| `frontend/analytics-dashboard.html` | Admin analytics |

### Environment

Copy [`.env.example`](.env.example) → `.env`. Important variables:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing key (required; min 32 chars in production) |
| `ANTHROPIC_API_KEY` | Claude access (AI features disabled / mock without it) |
| `ANTHROPIC_MODEL` | Optional override (default `claude-sonnet-4-6`) |
| `SQLITE_PATH` | Local DB path (default `./data/app.db`) |
| `DATABASE_URL` | Enables PostgreSQL path |
| `CORS_ORIGIN` | Allowed frontend origin (must be set explicitly in prod) |
| `GOOGLE_*` / `GITHUB_*` | OAuth client credentials |
| `SUBSCRIPTIONS_ENABLED` | `true` + Stripe keys to enable billing |
| `PORT` | API port (default `8080`) |

### Scripts

```bash
# Backend
cd backend && npm run dev      # migrate + watch server
cd backend && npm start        # migrate + production server
cd backend && npm test         # lightweight selftest
cd backend && npm run migrate  # migrations only

# Root
npm run test:e2e               # Playwright
npm run test:e2e:ui            # Playwright UI mode
```

### Deploy (Render)

Blueprint: [`render.yaml`](render.yaml)

- **quizall-backend** — Node web service (`npm start`, health: `/api/health`)
- **quizall-frontend** — static site from `frontend/`
- **quizall-db** — managed Postgres (`DATABASE_URL` injected)

Set `CORS_ORIGIN`, `FRONTEND_URL`, OAuth secrets, and `ANTHROPIC_API_KEY` in the Render dashboard.

### Project layout

```
backend/
  src/server.js          Entry: CORS, helmet, rate limits, routers
  src/routes/            auth, oauth, quiz, classroom, billing, analytics…
  src/lib/               db, db-pg, dbHelpers, anthropicClient, credits…
  migrations/            JS migrations (auto-run on start)
frontend/
  create.html / create.js   Main study product
  create/                   api, transcript, mindmap helpers
  lib/                      authGuard, i18n, theme…
  locales/                  9 languages (en, zh-CN, es, fr, ja, ko, ar, pt, hi)
  config.js                 API base URL by hostname
e2e/                     Playwright specs
```

### License

Not specified in-repo. Treat as private unless a license file is added.

---

<a id="中文-zh-cn"></a>

## 中文 (zh-CN)

AI 学习会话：把笔记、文件或 YouTube 变成 **学习计划 → Training/Testing 测验 → 复习笔记**。

粘贴文本、上传 PDF/DOCX，或放入 YouTube 链接。QuizAll 会生成结构化计划，进行检索练习（Training）或混合考试（Testing），并写出可分享、可回顾的学习笔记。

### 直接使用云端（无需配置 API Key）

只想用产品、不想本地安装或自备 Anthropic API Key？打开线上站点即可：

**https://quiz-all.com/**

本地开发与部署说明请见上方 [English](#english) 中的 Quick start / Environment / Deploy。

### 你能做什么

| 功能 | 说明 |
|------|------|
| **Study Chat** | 主工作台：计划 → 测验 → 笔记一气呵成 |
| **材料导入** | 粘贴文本；上传 PDF / DOCX / 文本；抓取 YouTube 字幕 |
| **学习计划** | 根据材料由 AI 生成主题与步骤 |
| **Training** | 短批选择题，常聚焦薄弱主题 |
| **Testing** | 混合题型考试，支持题型配比与考试预设 |
| **Exam map** | 主题树 + 掌握度着色（规则生成，非 LLM） |
| **学习笔记与分享** | 会话总结；分享链接 / 挑战深链 |
| **错题复习** | 类似间隔重复的错题队列 |
| **学习 streak** | 按时区计算的连续学习天数 |
| **积分 Credits** | 按动作计量，每日重置 |
| **登录** | 邮箱密码 + Google / GitHub OAuth |
| **Classroom** | 班级、作业、提交 |

订阅 / Stripe 代码已存在，但**默认关闭**（`SUBSCRIPTIONS_ENABLED=false`）。

---

<a id="español"></a>

## Español

Sesiones de estudio con IA: convierte notas, archivos o YouTube en un **plan de estudio → cuestionario Training/Testing → nota de repaso**.

Pega texto, sube PDF/DOCX o usa una URL de YouTube. QuizAll crea un plan estructurado, practica recuperación (Training) o exámenes mixtos (Testing) y genera una nota para compartir o revisar.

### Usa la app en la nube (sin configurar API key)

Si solo quieres usar QuizAll, abre el sitio en vivo — sin instalación local ni clave de Anthropic:

**https://quiz-all.com/**

Para desarrollo local, sigue la sección [English](#english) (Quick start / Environment / Deploy).

### Qué puedes hacer

| Función | Descripción |
|---------|-------------|
| **Study Chat** | Espacio principal: plan → quiz → nota |
| **Importar material** | Texto, PDF / DOCX / archivos de texto; subtítulos de YouTube |
| **Plan de estudio** | Temas y pasos generados por IA |
| **Training** | Lotes cortos de opción múltiple |
| **Testing** | Exámenes mixtos con presets |
| **Exam map** | Árbol de temas con dominio coloreado |
| **Nota + compartir** | Resumen de sesión y enlace compartible |
| **Repaso de errores** | Cola tipo repetición espaciada |
| **Racha** | Días consecutivos (zona horaria) |
| **Créditos** | Uso medido por acción |
| **Auth** | Email/contraseña + Google / GitHub |
| **Classroom** | Clases, tareas y entregas |

Suscripciones/Stripe existen pero están **desactivadas por defecto**.

---

<a id="français"></a>

## Français

Sessions d’étude assistées par IA : transformez notes, fichiers ou YouTube en **plan d’étude → quiz Training/Testing → fiche de révision**.

Collez du texte, importez PDF/DOCX ou une URL YouTube. QuizAll génère un plan structuré, propose de l’entraînement (Training) ou des examens mixtes (Testing), puis une note à partager ou relire.

### Utiliser l’app hébergée (sans clé API)

Pour utiliser QuizAll sans installation ni clé Anthropic :

**https://quiz-all.com/**

Pour le développement local, voir [English](#english) (Quick start / Environment / Deploy).

### Ce que vous pouvez faire

| Fonction | Description |
|----------|-------------|
| **Study Chat** | Espace principal : plan → quiz → note |
| **Import de matériel** | Texte, PDF / DOCX ; sous-titres YouTube |
| **Plan d’étude** | Thèmes et étapes générés par IA |
| **Training** | Lots courts de QCM |
| **Testing** | Examens mixtes avec préréglages |
| **Exam map** | Arbre de thèmes avec maîtrise colorée |
| **Note + partage** | Résumé et lien partageable |
| **Révision des erreurs** | File type répétition espacée |
| **Série (streak)** | Jours consécutifs (fuseau horaire) |
| **Crédits** | Mesure d’usage par action |
| **Auth** | Email/mot de passe + Google / GitHub |
| **Classroom** | Classes, devoirs, rendus |

Abonnements/Stripe présents mais **désactivés par défaut**.

---

<a id="日本語"></a>

## 日本語

AI 学習セッション：ノート・ファイル・YouTube を **学習計画 → Training/Testing クイズ → 復習ノート** に変換します。

テキスト貼り付け、PDF/DOCX アップロード、または YouTube URL。QuizAll が構造化プランを作り、Retrieval 練習（Training）または混合テスト（Testing）を行い、共有・振り返り用のノートを生成します。

### クラウド版を使う（API キー不要）

ローカル構築や Anthropic API キーなしで使う場合は、公開サイトへ：

**https://quiz-all.com/**

ローカル開発は [English](#english) の Quick start / Environment / Deploy を参照。

### できること

| 機能 | 内容 |
|------|------|
| **Study Chat** | メイン画面：計画 → クイズ → ノート |
| **教材取り込み** | テキスト、PDF / DOCX、YouTube 字幕 |
| **学習計画** | AI によるトピックとステップ |
| **Training** | 短めの選択問題バッチ |
| **Testing** | 混合問題の試験モード |
| **Exam map** | 習熟度色付きトピックツリー |
| **ノート＋共有** | セッション要約と共有リンク |
| **誤答復習** | 間隔反復風のキュー |
| **連続学習** | タイムゾーン対応のストリーク |
| **クレジット** | アクション単位の利用量 |
| **認証** | メール/パスワード + Google / GitHub |
| **Classroom** | クラス・課題・提出 |

サブスク/Stripe はコードにありますが **既定ではオフ** です。

---

<a id="한국어"></a>

## 한국어

AI 학습 세션: 노트·파일·YouTube를 **학습 계획 → Training/Testing 퀴즈 → 복습 노트**로 바꿉니다.

텍스트 붙여넣기, PDF/DOCX 업로드, 또는 YouTube URL. QuizAll이 구조화된 계획을 만들고, 회상 연습(Training) 또는 혼합 시험(Testing)을 진행한 뒤 공유·복습용 노트를 작성합니다.

### 클라우드 앱 사용 (API 키 불필요)

로컬 설치나 Anthropic API 키 없이 쓰려면:

**https://quiz-all.com/**

로컬 개발은 [English](#english)의 Quick start / Environment / Deploy를 보세요.

### 할 수 있는 것

| 기능 | 설명 |
|------|------|
| **Study Chat** | 메인 워크스페이스: 계획 → 퀴즈 → 노트 |
| **자료 가져오기** | 텍스트, PDF / DOCX, YouTube 자막 |
| **학습 계획** | AI가 주제와 단계 생성 |
| **Training** | 짧은 객관식 배치 |
| **Testing** | 혼합형 시험 + 프리셋 |
| **Exam map** | 숙달도 색상 주제 트리 |
| **노트 + 공유** | 세션 요약과 공유 링크 |
| **오답 복습** | 간격 반복 스타일 큐 |
| **연속 학습** | 시간대 기준 스트릭 |
| **크레딧** | 행동별 사용량 |
| **인증** | 이메일/비밀번호 + Google / GitHub |
| **Classroom** | 수업·과제·제출 |

구독/Stripe 코드는 있으나 **기본값은 꺼짐**입니다.

---

<a id="العربية"></a>

## العربية

جلسات دراسة بالذكاء الاصطناعي: حوّل الملاحظات أو الملفات أو YouTube إلى **خطة دراسة → اختبار Training/Testing → ملاحظة مراجعة**.

الصق نصًا، ارفع PDF/DOCX، أو ضع رابط YouTube. يبني QuizAll خطة منظمة، ويقدّم تدريب استرجاع (Training) أو امتحانات مختلطة (Testing)، ثم يكتب ملاحظة للمشاركة أو المراجعة.

### استخدم النسخة السحابية (بدون مفتاح API)

إذا أردت الاستخدام فقط دون تثبيت محلي أو مفتاح Anthropic:

**https://quiz-all.com/**

للتطوير المحلي راجع قسم [English](#english) (Quick start / Environment / Deploy).

### ما يمكنك فعله

| الميزة | الوصف |
|--------|--------|
| **Study Chat** | مساحة العمل: خطة → اختبار → ملاحظة |
| **استيراد المواد** | نص، PDF / DOCX، ترجمات YouTube |
| **خطة الدراسة** | مواضيع وخطوات مولَّدة بالذكاء الاصطناعي |
| **Training** | دفعات قصيرة من اختيار من متعدد |
| **Testing** | امتحانات مختلطة مع إعدادات جاهزة |
| **Exam map** | شجرة مواضيع بتلوين الإتقان |
| **ملاحظة + مشاركة** | ملخص الجلسة ورابط قابل للمشاركة |
| **مراجعة الأخطاء** | طابور بأسلوب التكرار المتباعد |
| **سلسلة الأيام** | أيام متتالية حسب المنطقة الزمنية |
| **الأرصدة** | قياس الاستخدام لكل إجراء |
| **المصادقة** | بريد/كلمة مرور + Google / GitHub |
| **Classroom** | صفوف وواجبات وتسليمات |

الاشتراكات/Stripe موجودة لكن **معطّلة افتراضيًا**.

---

<a id="português"></a>

## Português

Sessões de estudo com IA: transforme notas, arquivos ou YouTube em um **plano de estudo → quiz Training/Testing → nota de revisão**.

Cole texto, envie PDF/DOCX ou use uma URL do YouTube. O QuizAll monta um plano estruturado, faz prática de recuperação (Training) ou provas mistas (Testing) e gera uma nota para compartilhar ou revisar.

### Use o app na nuvem (sem configurar API key)

Se quiser só usar o QuizAll, abra o site — sem instalação local nem chave da Anthropic:

**https://quiz-all.com/**

Para desenvolvimento local, veja [English](#english) (Quick start / Environment / Deploy).

### O que você pode fazer

| Recurso | Descrição |
|---------|-----------|
| **Study Chat** | Espaço principal: plano → quiz → nota |
| **Importar material** | Texto, PDF / DOCX; legendas do YouTube |
| **Plano de estudo** | Tópicos e passos gerados por IA |
| **Training** | Lotes curtos de múltipla escolha |
| **Testing** | Provas mistas com presets |
| **Exam map** | Árvore de tópicos com domínio colorido |
| **Nota + compartilhar** | Resumo da sessão e link compartilhável |
| **Revisão de erros** | Fila no estilo repetição espaçada |
| **Sequência (streak)** | Dias consecutivos (fuso horário) |
| **Créditos** | Uso medido por ação |
| **Auth** | Email/senha + Google / GitHub |
| **Classroom** | Turmas, tarefas e envios |

Assinaturas/Stripe existem, mas ficam **desativadas por padrão**.

---

<a id="हिन्दी"></a>

## हिन्दी

AI अध्ययन सत्र: नोट्स, फ़ाइलें या YouTube को **अध्ययन योजना → Training/Testing क्विज़ → रिवीज़न नोट** में बदलें।

टेक्स्ट पेस्ट करें, PDF/DOCX अपलोड करें, या YouTube URL दें। QuizAll संरचित योजना बनाता है, रिकॉल अभ्यास (Training) या मिश्रित परीक्षा (Testing) चलाता है, फिर साझा/दोबारा देखने योग्य नोट लिखता है।

### क्लाउड ऐप इस्तेमाल करें (API key की ज़रूरत नहीं)

बिना लोकल इंस्टॉल या Anthropic API key के इस्तेमाल के लिए:

**https://quiz-all.com/**

लोकल डेवलपमेंट के लिए [English](#english) में Quick start / Environment / Deploy देखें।

### आप क्या कर सकते हैं

| सुविधा | विवरण |
|--------|--------|
| **Study Chat** | मुख्य वर्कस्पेस: योजना → क्विज़ → नोट |
| **सामग्री इनजेस्ट** | टेक्स्ट, PDF / DOCX, YouTube कैप्शन |
| **अध्ययन योजना** | AI से विषय और चरण |
| **Training** | छोटे MCQ बैच |
| **Testing** | मिश्रित परीक्षा + प्रीसेट |
| **Exam map** | महारत रंगों वाला विषय वृक्ष |
| **नोट + शेयर** | सत्र सारांश और शेयर लिंक |
| **गलत जवाब रिवीज़न** | स्पेस्ड-रिपीटिशन शैली कतार |
| **स्ट्रीक** | टाइमज़ोन के साथ लगातार दिन |
| **क्रेडिट** | क्रिया के अनुसार उपयोग |
| **Auth** | ईमेल/पासवर्ड + Google / GitHub |
| **Classroom** | कक्षा, असाइनमेंट, सबमिशन |

सब्सक्रिप्शन/Stripe कोड मौजूद है, पर **डिफ़ॉल्ट रूप से बंद** है।
