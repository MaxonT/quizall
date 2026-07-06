// @ts-check

/** @typedef {{ type: string; question: string; options?: string[]; correct_answer: string | number; explanation: string }} MockQuestion */

const SAMPLE_PLAN = {
  subject: "Photosynthesis",
  summary: "This material is mainly about photosynthesis. We'll quiz you in three short rounds.",
  topics: ["Sunlight", "Chlorophyll", "Glucose", "Oxygen"],
  key_concepts: [{ concept: "Chlorophyll", detail: "Green pigment in leaves." }],
  plan: [{ title: "Learn Sunlight", why: "Core idea.", estimated_minutes: 5 }],
};

const SAMPLE_NOTE = {
  summary: "You worked through sunlight and chlorophyll. Keep reviewing the parts you missed.",
  what_you_know: ["You touched on Sunlight.", "You touched on Chlorophyll."],
  what_to_review: ["Skim your notes tomorrow to lock it in."],
  key_takeaways: ["Sunlight matters for this subject.", "Chlorophyll matters for this subject."],
};

/** @param {import('@playwright/test').Page} page */
export async function installMockApi(page) {
  /** @type {{ id: string; name: string; rounds: Array<{ roundLabel: string; score: number; total: number; questions: MockQuestion[] }> }} */
  const session = {
    id: "mock-project-1",
    name: "Study · Mock",
    rounds: [],
  };

  let roundCounter = 0;

  function mcqQuestions() {
    return Array.from({ length: 5 }, (_, i) => ({
      type: "multiple_choice",
      question: `MCQ ${i + 1}: What do plants use to make food?`,
      options: ["Sunlight", "Rocks", "Plastic", "Metal"],
      correct_answer: 0,
      explanation: "Plants use sunlight in photosynthesis.",
    }));
  }

  function fibQuestions() {
    return Array.from({ length: 5 }, (_, i) => ({
      type: "fill_in_the_blank",
      question: `Fill ${i + 1}: The green pigment is called ___.`,
      correct_answer: "chlorophyll",
      explanation: "Chlorophyll captures light energy.",
    }));
  }

  function frqQuestions() {
    return Array.from({ length: 3 }, (_, i) => ({
      type: "free_response",
      question: `Short answer ${i + 1}: Explain photosynthesis in simple words.`,
      correct_answer: "Plants use sunlight water and carbon dioxide to make sugar and release oxygen",
      explanation: "Keep it simple: inputs → sugar + oxygen.",
    }));
  }

  function nextRoundQuestions() {
    const idx = roundCounter % 3;
    roundCounter += 1;
    if (idx === 0) return { label: "Round 1 · Multiple Choice", questions: mcqQuestions() };
    if (idx === 1) return { label: "Round 2 · Fill in the Blank", questions: fibQuestions() };
    return { label: "Round 3 · Short Answer", questions: frqQuestions() };
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
    if (path === "/api/billing/status" && method === "GET") {
      return json({
        ok: true,
        subscription: { plan: "free", status: "none" },
        usage: { promptOptimization: 1, questionWizard: 0 },
        limits: { promptOptimization: { daily: 10 }, questionWizard: { daily: 5 } },
      });
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
      return json({ ok: true, studyPlan: SAMPLE_PLAN, analysis: SAMPLE_PLAN });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/study-plan$/) && method === "GET") {
      return json({ ok: true, studyPlan: SAMPLE_PLAN });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/note$/) && method === "POST") {
      return json({ ok: true, note: SAMPLE_NOTE });
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+\/note$/) && method === "GET") {
      return session.rounds.length >= 3
        ? json({ ok: true, note: SAMPLE_NOTE })
        : json({ ok: false, error: "No note" }, 404);
    }
    if (path.match(/\/api\/quiz\/projects\/[^/]+$/) && method === "GET") {
      return json({ ok: true, project: { id: session.id, name: session.name }, files: [] });
    }
    if (path === "/api/quiz/generate" && method === "POST") {
      const round = nextRoundQuestions();
      return json({ ok: true, quiz: round.questions, meta: { mock: true } });
    }
    if (path === "/api/quiz/history" && method === "POST") {
      const body = route.request().postDataJSON();
      const questions = body?.questions || [];
      const correct = questions.filter((q) => q.isCorrect).length;
      session.rounds.push({
        roundLabel: body?.roundLabel || `Round ${session.rounds.length + 1}`,
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
