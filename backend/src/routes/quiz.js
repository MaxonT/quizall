import { Router } from "express";
import { requireAuth } from "./auth.js";
import { db } from "../lib/db.js";
import { chatJsonAnthropic } from "../lib/anthropicClient.js";
import { nanoid } from "nanoid";

export const quizRouter = Router();

const VALID_QUESTION_TYPES = new Set(["multiple_choice", "true_false", "fill_in_the_blank"]);
const CONTENT_MIN_LENGTH = 30;
const NUM_QUESTIONS_MIN = 5;
const NUM_QUESTIONS_MAX = 20;
const HISTORY_MAX_LIMIT = 50;
const AI_MODEL = "claude-sonnet-4-20250514";

// ─── Ensure quiz tables exist (SQLite only — PostgreSQL tables are in db-pg.js initializeSchema) ──
const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);
if (!USE_POSTGRES) {
  db.exec(`
CREATE TABLE IF NOT EXISTS quiz_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  topics TEXT,
  elapsed INTEGER,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_qr_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results(user_id, created_at);
CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT,
  correct_answer TEXT NOT NULL,
  user_answer TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT fk_qq_result FOREIGN KEY (result_id) REFERENCES quiz_results(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_result ON quiz_questions(result_id);
CREATE TABLE IF NOT EXISTS quiz_api_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quiz_api_logs_user ON quiz_api_logs(user_id, created_at);
  `);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function logApiCall(userId, action, usage, durationMs) {
  try {
    db.prepare(`
      INSERT INTO quiz_api_logs (id, user_id, action, model, input_tokens, output_tokens, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(16),
      userId,
      action,
      AI_MODEL,
      usage?.input_tokens || 0,
      usage?.output_tokens || 0,
      durationMs || 0,
      new Date().toISOString()
    );
  } catch (err) {
    console.error("[quizall] Failed to log API call:", err.message);
  }
}

function buildAnalysisPrompt(content) {
  return {
    system: [
      "You are an expert educator. Analyze the following study material and extract the key concepts, facts, and topics that a student should be tested on.",
      "Return a JSON object with this exact structure:",
      '{ "subject": "string — the overall subject/topic", "topics": ["array of subtopic strings"], "key_concepts": [{ "concept": "string", "detail": "string", "difficulty": "easy|medium|hard" }] }',
    ].join("\n"),
    user: content,
  };
}

function buildQuizPrompt(content, analysis, types, numQuestions) {
  const typeList = types.join(", ");
  return {
    system: [
      "You are an expert quiz generator who applies Bloom's Taxonomy to create questions that test different cognitive levels: Remember, Understand, Apply, Analyze, Evaluate, and Create.",
      `Generate exactly ${numQuestions} quiz questions using ONLY these question types: ${typeList}.`,
      "Distribute the questions across difficulty levels and Bloom's Taxonomy levels for comprehensive assessment.",
      "",
      "Return a JSON array where each element follows this structure:",
      "{",
      '  "type": "multiple_choice" | "true_false" | "fill_in_the_blank",',
      '  "question": "the question text",',
      '  "options": ["A", "B", "C", "D"] (only for multiple_choice; null for others),',
      '  "correct_answer": "the correct answer string",',
      '  "explanation": "brief explanation of why this is correct",',
      '  "difficulty": "easy" | "medium" | "hard",',
      '  "bloom_level": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create"',
      "}",
      "",
      "For true_false questions, correct_answer must be exactly \"true\" or \"false\".",
      "For fill_in_the_blank, the question should contain a blank indicated by \"___\".",
    ].join("\n"),
    user: [
      "=== CONTENT ANALYSIS ===",
      JSON.stringify(analysis, null, 2),
      "",
      "=== ORIGINAL STUDY MATERIAL ===",
      content,
    ].join("\n"),
  };
}

// ─── POST /generate ────────────────────────────────────────────────────────

quizRouter.post("/generate", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { content, types, numQuestions } = req.body || {};

    // --- Validation ---
    if (!content || typeof content !== "string" || content.trim().length < CONTENT_MIN_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `Content must be at least ${CONTENT_MIN_LENGTH} characters`,
      });
    }

    if (!Array.isArray(types) || types.length === 0) {
      return res.status(400).json({ ok: false, error: "At least one question type is required" });
    }
    const invalidTypes = types.filter((t) => !VALID_QUESTION_TYPES.has(t));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Invalid question type(s): ${invalidTypes.join(", ")}. Valid types: ${[...VALID_QUESTION_TYPES].join(", ")}`,
      });
    }

    const num = Number(numQuestions);
    if (!Number.isInteger(num) || num < NUM_QUESTIONS_MIN || num > NUM_QUESTIONS_MAX) {
      return res.status(400).json({
        ok: false,
        error: `numQuestions must be an integer between ${NUM_QUESTIONS_MIN} and ${NUM_QUESTIONS_MAX}`,
      });
    }

    // --- Pass 1: Analysis ---
    const analysisStart = Date.now();
    const analysisPrompt = buildAnalysisPrompt(content.trim());
    const analysisResult = await chatJsonAnthropic({
      system: analysisPrompt.system,
      user: analysisPrompt.user,
      model: AI_MODEL,
      maxTokens: 2048,
      temperature: 0.2,
    });
    const analysisDuration = Date.now() - analysisStart;

    const analysis = analysisResult.data;
    if (!analysis.subject || !Array.isArray(analysis.topics) || !Array.isArray(analysis.key_concepts)) {
      console.error("[quizall] Analysis pass returned unexpected structure:", JSON.stringify(analysis).slice(0, 200));
      return res.status(502).json({ ok: false, error: "AI analysis returned an unexpected format. Please try again." });
    }

    logApiCall(userId, "generate:analysis", analysisResult.usage, analysisDuration);

    // --- Pass 2: Quiz Generation ---
    const quizStart = Date.now();
    const quizPrompt = buildQuizPrompt(content.trim(), analysis, types, num);
    const quizResult = await chatJsonAnthropic({
      system: quizPrompt.system,
      user: quizPrompt.user,
      model: AI_MODEL,
      maxTokens: 4096,
      temperature: 0.4,
    });
    const quizDuration = Date.now() - quizStart;

    let questions = quizResult.data;
    if (!Array.isArray(questions)) {
      questions = questions?.questions || questions?.quiz || [];
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error("[quizall] Quiz generation returned no questions:", JSON.stringify(quizResult.data).slice(0, 200));
      return res.status(502).json({ ok: false, error: "AI failed to generate questions. Please try again." });
    }

    logApiCall(userId, "generate:quiz", quizResult.usage, quizDuration);

    console.log(`[quizall] Generated ${questions.length} questions for user ${userId} (analysis: ${analysisDuration}ms, quiz: ${quizDuration}ms)`);

    return res.json({
      ok: true,
      quiz: questions,
      analysis: {
        subject: analysis.subject,
        topics: analysis.topics,
        key_concepts: analysis.key_concepts,
      },
    });
  } catch (err) {
    console.error("[quizall] generate error:", err);
    if (err.code === "ANTHROPIC_DISABLED") {
      return res.status(503).json({ ok: false, error: "AI service is currently unavailable" });
    }
    return res.status(500).json({ ok: false, error: "Quiz generation failed" });
  }
});

// ─── GET /history ──────────────────────────────────────────────────────────

quizRouter.get("/history", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(HISTORY_MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countRow = db.prepare("SELECT COUNT(*) AS total FROM quiz_results WHERE user_id = ?").get(userId);
    const total = countRow?.total || 0;

    const results = db.prepare(`
      SELECT
        qr.id,
        qr.subject,
        qr.score,
        qr.total,
        qr.topics,
        qr.elapsed,
        qr.created_at,
        (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.result_id = qr.id) AS question_count
      FROM quiz_results qr
      WHERE qr.user_id = ?
      ORDER BY qr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const parsed = results.map((r) => ({
      ...r,
      topics: r.topics ? JSON.parse(r.topics) : [],
    }));

    return res.json({
      ok: true,
      results: parsed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[quizall] history GET error:", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch quiz history" });
  }
});

// ─── POST /history ─────────────────────────────────────────────────────────

quizRouter.post("/history", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const { subject, score, total, topics, questions, answers, elapsed } = req.body || {};

    if (score == null || total == null || !Number.isInteger(score) || !Number.isInteger(total) || total < 1) {
      return res.status(400).json({ ok: false, error: "Valid score and total are required" });
    }
    if (score < 0 || score > total) {
      return res.status(400).json({ ok: false, error: "Score must be between 0 and total" });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ ok: false, error: "Questions array is required" });
    }

    const resultId = nanoid(16);
    const now = new Date().toISOString();

    const insertResult = db.prepare(`
      INSERT INTO quiz_results (id, user_id, subject, score, total, topics, elapsed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertQuestion = db.prepare(`
      INSERT INTO quiz_questions (id, result_id, type, question, options, correct_answer, user_answer, is_correct, explanation, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const saveAll = db.transaction(() => {
      insertResult.run(
        resultId,
        userId,
        subject || "Untitled Quiz",
        score,
        total,
        topics ? JSON.stringify(topics) : null,
        elapsed || null,
        now
      );

      const answerMap = Array.isArray(answers) ? answers : [];
      questions.forEach((q, i) => {
        const userAnswer = answerMap[i]?.answer ?? answerMap[i] ?? null;
        const isCorrect = answerMap[i]?.is_correct ?? (userAnswer === q.correct_answer ? 1 : 0);
        insertQuestion.run(
          nanoid(16),
          resultId,
          q.type || "unknown",
          q.question || "",
          q.options ? JSON.stringify(q.options) : null,
          q.correct_answer || "",
          typeof userAnswer === "string" ? userAnswer : JSON.stringify(userAnswer),
          isCorrect ? 1 : 0,
          q.explanation || null,
          i
        );
      });
    });

    saveAll();
    console.log(`[quizall] Saved quiz result ${resultId} for user ${userId} (${score}/${total})`);

    return res.status(201).json({ ok: true, id: resultId });
  } catch (err) {
    console.error("[quizall] history POST error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save quiz result" });
  }
});

// ─── DELETE /history/:id ───────────────────────────────────────────────────

quizRouter.delete("/history/:id", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const resultId = req.params.id;

    const row = db.prepare("SELECT id, user_id FROM quiz_results WHERE id = ?").get(resultId);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Quiz result not found" });
    }
    if (row.user_id !== userId) {
      return res.status(403).json({ ok: false, error: "You can only delete your own quiz results" });
    }

    const deleteAll = db.transaction(() => {
      db.prepare("DELETE FROM quiz_questions WHERE result_id = ?").run(resultId);
      db.prepare("DELETE FROM quiz_results WHERE id = ?").run(resultId);
    });

    deleteAll();
    console.log(`[quizall] Deleted quiz result ${resultId} for user ${userId}`);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[quizall] history DELETE error:", err);
    return res.status(500).json({ ok: false, error: "Failed to delete quiz result" });
  }
});
