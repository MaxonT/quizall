// @ts-check

/** @typedef {{ type: string; question: string; options?: string[]; correct_answer: string | number; explanation: string }} MockQuestion */

const SAMPLE_PLAN = {
  session_name: "Photosynthesis basics",
  subject: "Photosynthesis",
  summary: "Currently learning Sunlight — overall progress about 5%. This material covers photosynthesis.",
  topics: ["Sunlight", "Chlorophyll", "Glucose", "Oxygen"],
  key_concepts: [
    {
      concept: "Chlorophyll",
      detail: "Green pigment in leaves.",
      importance: "core",
      scenario1: "Identify leaf color in a lab",
      scenario2: "Explain why plants are green",
    },
  ],
  plan: [{ title: "Learn Sunlight", why: "Core idea.", estimated_minutes: 5, importance: "core" }],
  progress: {
    overall_percent: 5,
    current_lecture: { title: "Sunlight", section: "Intro", pages: "p.1-3", citation: "notes.pdf p.1-3" },
    completed_lectures: [],
    phases: [{ phase: "Phase 1", title: "Sunlight", goal: "Understand basics", status: "active" }],
  },
};

const SAMPLE_NOTE = {
  summary: "You worked through sunlight and chlorophyll. Keep reviewing the parts you missed.",
  what_you_know: ["You touched on Sunlight.", "You touched on Chlorophyll."],
  what_to_review: ["Skim your notes tomorrow to lock it in."],
  key_takeaways: ["Sunlight matters for this subject.", "Chlorophyll matters for this subject."],
};

const SAMPLE_MINDMAP = {
  id: "mm-1",
  title: "Photosynthesis ExamTopics",
  generatedAt: new Date().toISOString(),
  message: "This mindmap was made specifically for your exam.",
  nodes: [
    {
      id: "t1",
      text: "Sunlight",
      status: "yellow",
      children: [{ id: "t1a", text: "Light energy capture", status: "gray", children: [] }],
    },
    {
      id: "t2",
      text: "Chlorophyll",
      status: "green",
      children: [],
    },
  ],
};

/** @param {import('@playwright/test').Page} page */
export async function installMockApi(page) {
  /** @type {{ id: string; name: string; rounds: Array<{ roundLabel: string; score: number; total: number; questions: MockQuestion[] }>; mindmap: object | null; files: Array<{ id: string; name: string }>; transcript: { messages: object[]; trainingState: object | null } | null; trainingBatch: number }} */
  const session = {
    id: "mock-project-1",
    name: "Study · Mock",
    rounds: [],
    mindmap: null,
    files: [],
    transcript: null,
    trainingBatch: 0,
  };

  function mixedQuestions(typeMix, numQuestions) {
    const mcq = Number(typeMix?.multiple_choice) || 7;
    const fib = Number(typeMix?.fill_in_the_blank) || 4;
    const frq = Number(typeMix?.free_response) || 2;
    const total = numQuestions || mcq + fib + frq;
    const questions = [];

    for (let i = 0; i < mcq && questions.length < total; i++) {
      questions.push({
        type: "multiple_choice",
        question: `MCQ ${i + 1}: What do plants use to make food?`,
        options: ["Sunlight", "Rocks", "Plastic", "Metal"],
        correct_answer: 0,
        explanation: "Plants use sunlight in photosynthesis.",
      });
    }
    for (let i = 0; i < fib && questions.length < total; i++) {
      questions.push({
        type: "fill_in_the_blank",
        question: `Fill ${i + 1}: The green pigment is called ___.`,
        correct_answer: "chlorophyll",
        explanation: "Chlorophyll captures light energy.",
      });
    }
    for (let i = 0; i < frq && questions.length < total; i++) {
      questions.push({
        type: "free_response",
        question: `Short answer ${i + 1}: Explain photosynthesis in simple words.`,
        correct_answer: "Plants use sunlight water and carbon dioxide to make sugar and release oxygen",
        explanation: "Keep it simple: inputs → sugar + oxygen.",
      });
    }
    return questions.slice(0, total);
  }

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/auth/register" && method === "POST") {
      return json({ ok: true, token: "mock.jwt.token", user: { email: "e2e@example.com" } });
    }
    if (path === "/api/auth/me" && method === "GET") {
      return json({ ok: true, user: { email: "e2e@example.com", timezone: "UTC", subscription: { tier: "free" } } });
    }
    if (path === "/api/settings" && method === "GET") {
      return json({
        ok: true,
        settings: { features: { subscriptionsEnabled: false, enforceTokenLimits: false } },
      });
    }
    if (path === "/api/billing/status" && method === "GET") {
      return json({
        ok: true,
        stripeConfigured: false,
        subscription: { plan: "free", status: "none" },
        credits: {
          balance: 80,
          dailyAllowance: 80,
          dailyRemaining: 80,
          dailyUsed: 0,
          poolRemaining: 0,
          nextResetAt: new Date(Date.now() + 86400000).toISOString(),
        },
        creditCosts: {
          studyPlan: 12,
          examMap: 15,
          quizTesting: 20,
          trainingBatch: 10,
          trainingRefill: 8,
          studyNote: 10,
          fileUpload: 3,
        },
        usage: { promptOptimization: 1, questionWizard: 0 },
        limits: { promptOptimization: { daily: 10 }, questionWizard: { daily: 5 } },
      });
    }
    if (path === "/api/billing/credit-history" && method === "GET") {
      return json({
        ok: true,
        items: [{ id: "h1", credits: 12, reason: "Study plan", createdAt: new Date().toISOString() }],
      });
    }
    if (path === "/api/quiz/folders" && method === "GET") {
      return json({ ok: true, folders: [] });
    }
    if (path === "/api/quiz/folders" && method === "POST") {
      const body = route.request().postDataJSON();
      return json({ ok: true, folder: { id: "folder-1", name: body?.name || "Project" } }, 201);
    }
    if (path === "/api/quiz/study-streak" && method === "GET") {
      return json({
        ok: true,
        currentStreak: 2,
        heatmap: Array.from({ length: 7 }, (_, i) => ({ intensity: (i % 3) + 1 })),
      });
    }
    if (path === "/api/quiz/usage" && method === "GET") {
      return json({ ok: true, usage: { quizzes: { used: 1, limit: 10 }, tokens: { used: 100, limit: 5000 } } });
    }
    if (path === "/api/quiz/projects" && method === "GET") {
      const projects = [
        {
          id: session.id,
          name: session.name,
          folderId: null,
          fileCount: 0,
          quizCount: session.rounds.length,
          latestAccuracy: session.rounds.length ? 80 : null,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];
      return json({ ok: true, projects });
    }
    if (path === "/api/quiz/projects" && method === "POST") {
      const body = route.request().postDataJSON();
      session.name = body?.name || session.name;
      return json({ ok: true, project: { id: session.id, name: session.name } }, 201);
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/study-plan$/) && method === "POST") {
      session.name = SAMPLE_PLAN.session_name;
      return json({
        ok: true,
        studyPlan: SAMPLE_PLAN,
        analysis: SAMPLE_PLAN,
        hasUploadedMaterial: session.files.length > 0,
      });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/study-plan$/) && method === "GET") {
      return json({ ok: true, studyPlan: SAMPLE_PLAN });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/note$/) && method === "POST") {
      return json({ ok: true, note: SAMPLE_NOTE });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/note$/) && method === "GET") {
      return session.rounds.length >= 1
        ? json({ ok: true, note: SAMPLE_NOTE })
        : json({ ok: false, error: "No note" }, 404);
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/outline-candidates$/) && method === "GET") {
      const candidates = session.files.length
        ? session.files.map((f, i) => ({
            id: f.id,
            fileName: f.name,
            score: 5 - i,
            preview: "Chapter 1 Photosynthesis overview",
          }))
        : [];
      return json({ ok: true, candidates, recommendedFileId: candidates[0]?.id || null, keywordSet: [] });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/exam-prep$/) && method === "POST") {
      session.mindmap = SAMPLE_MINDMAP;
      return json({
        ok: true,
        projectId: session.id,
        mindmap: SAMPLE_MINDMAP,
        topics: ["Sunlight", "Chlorophyll"],
      });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/mindmap$/) && method === "PUT") {
      return json({ ok: true, updatedAt: new Date().toISOString() });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/files$/) && method === "POST") {
      const body = route.request().postDataJSON();
      const uploaded = (body?.files || []).map((f, i) => ({
        id: `file-${session.files.length + i + 1}`,
        name: f.name,
        content_length: (f.text || "").length,
      }));
      session.files.push(...uploaded.map((u) => ({ id: u.id, name: u.name })));
      return json({ ok: true, files: uploaded });
    }
    if (path === "/api/quiz/wrong-answers" && method === "GET") {
      const items = session.rounds.flatMap((round) =>
        (round.questions || [])
          .filter((q) => q.isCorrect === false)
          .map((q, i) => ({
            id: `wrong-${i}`,
            question: q.question,
            subject: "Photosynthesis",
            createdAt: new Date().toISOString(),
          }))
      );
      return json({ ok: true, items: items.slice(0, 8), total: items.length });
    }
    if (path === "/api/quiz/share" && method === "POST") {
      return json({
        ok: true,
        url: "http://127.0.0.1:4173/share.html?token=mock-share-token",
        token: "mock-share-token",
      });
    }
    if (path.match(/^\/api\/quiz\/share\/[^/]+$/) && method === "GET") {
      return json({
        ok: true,
        projectName: session.name,
        subject: "Photosynthesis",
        note: SAMPLE_NOTE,
        rounds: session.rounds.map((r) => ({
          roundLabel: r.roundLabel,
          score: r.score,
          total: r.total,
          accuracy: Math.round((r.score / r.total) * 100),
        })),
      });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/transcript$/) && method === "GET") {
      if (!session.transcript) {
        return json({ ok: true, messages: [], trainingState: null, updatedAt: null });
      }
      return json({
        ok: true,
        messages: session.transcript.messages,
        trainingState: session.transcript.trainingState,
        updatedAt: new Date().toISOString(),
      });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/transcript$/) && method === "PUT") {
      const body = route.request().postDataJSON();
      session.transcript = {
        messages: body?.messages || [],
        trainingState: body?.trainingState ?? null,
      };
      return json({ ok: true, updatedAt: new Date().toISOString() });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+$/) && method === "GET") {
      return json({
        ok: true,
        project: { id: session.id, name: session.name },
        files: session.files,
        examPrep: session.mindmap
          ? { mindmap: session.mindmap, examTopics: "Sunlight, Chlorophyll", generatedAt: new Date().toISOString() }
          : null,
      });
    }
    if (path === "/api/quiz/generate" && method === "POST") {
      const body = route.request().postDataJSON();
      if (body?.mode === "training") {
        const batchSize = Math.min(10, Math.max(1, Number(body?.batchSize) || 5));
        session.trainingBatch += 1;
        const base = (session.trainingBatch - 1) * batchSize;
        const quiz = Array.from({ length: batchSize }, (_, i) => ({
          type: "multiple_choice",
          question: `Training Q${base + i + 1}: What do plants use to make food?`,
          options: ["Sunlight", "Rocks", "Plastic", "Metal"],
          correct_answer: 0,
          explanation: "Plants use sunlight in photosynthesis.",
          importance: "core",
          topic_focus: "Sunlight",
          source_citation: "notes.pdf p.1",
          scenario1: "Growing plants near a window",
          scenario2: "Explaining why plants need light",
        }));
        return json({
          ok: true,
          quiz,
          questions: quiz,
          creditsDebited: body?.isRefill ? 8 : 10,
          meta: { mock: true, mode: "training", batchSize },
        });
      }
      const questions = mixedQuestions(body?.typeMix, body?.numQuestions);
      return json({ ok: true, quiz: questions, meta: { mock: true, mode: "testing" } });
    }
    if (path === "/api/quiz/history" && method === "POST") {
      const body = route.request().postDataJSON();
      const questions = body?.questions || [];
      const correct = questions.filter((q) => q.isCorrect).length;
      session.rounds.push({
        roundLabel: body?.roundLabel || "Mixed Quiz",
        score: correct,
        total: questions.length,
        questions,
      });
      return json({ ok: true, id: `result-${session.rounds.length}` }, 201);
    }
    if (path === "/api/quiz/history" && method === "GET") {
      const results = session.rounds.map((round, index) => ({
        id: `result-${index + 1}`,
        projectId: session.id,
        roundLabel: round.roundLabel,
        score: round.score,
        total: round.total,
        questions: round.questions.map((q) => ({
          ...q,
          userAnswer: q.userAnswer,
          isCorrect: q.isCorrect,
        })),
        createdAt: new Date().toISOString(),
      }));
      return json({ ok: true, results, pagination: { page: 1, limit: 10, total: results.length, totalPages: 1 } });
    }

    return json({ ok: false, error: `Unhandled mock route: ${method} ${path}` }, 404);
  });
}
