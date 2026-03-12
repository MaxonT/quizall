import { Router } from "express";
import { nanoid } from "nanoid";
import { optionalAuth, requireAuth } from "./auth.js";
import { db, ensureColumn } from "../lib/db.js";
import { USE_POSTGRES, dbGet, dbRun, dbAll } from "../lib/dbHelpers.js";
import { chatJsonAnthropic } from "../lib/anthropicClient.js";

export const quizRouter = Router();

const VALID_QUESTION_TYPES = new Set(["multiple_choice", "true_false", "fill_in_the_blank", "free_response"]);
const CONTENT_MIN_LENGTH = 30;
const NUM_QUESTIONS_MIN = 5;
const NUM_QUESTIONS_MAX = 20;
const HISTORY_MAX_LIMIT = 50;
const PROJECT_MAX_LIMIT = 100;
const FILE_TEXT_MAX_LENGTH = 120000;
const MAX_FILE_BATCH = 30;
const STREAK_MAX_DAYS = 365;
const AI_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_ENABLED = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());

const OUTLINE_KEYWORDS = ["syllabus", "outline", "review", "exam", "topic", "考纲", "重点", "复习"];

const PROJECT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS study_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  exam_name TEXT,
  exam_date TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_project_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_study_projects_user ON study_projects(user_id, updated_at);

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL DEFAULT 0,
  is_outline_candidate INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_project_files_project FOREIGN KEY (project_id) REFERENCES study_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_files_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_files_user ON project_files(user_id, created_at);

CREATE TABLE IF NOT EXISTS project_exam_prep (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  exam_topics TEXT NOT NULL,
  topics_source TEXT,
  selected_file_id TEXT,
  mindmap_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_exam_prep_project FOREIGN KEY (project_id) REFERENCES study_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_prep_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_exam_prep_project ON project_exam_prep(project_id);
`;

const QUIZ_SCHEMA_SQL = `
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
`;

if (!USE_POSTGRES) {
  db.exec(QUIZ_SCHEMA_SQL);
  db.exec(PROJECT_SCHEMA_SQL);
} else {
  await db.exec(PROJECT_SCHEMA_SQL);
}

await Promise.resolve(ensureColumn("quiz_results", "project_id", "TEXT"));
await Promise.resolve(ensureColumn("quiz_questions", "source_reference", "TEXT"));
await Promise.resolve(ensureColumn("quiz_questions", "topic_node", "TEXT"));
await Promise.resolve(ensureColumn("quiz_questions", "difficulty", "TEXT"));
await Promise.resolve(ensureColumn("quiz_questions", "bloom_level", "TEXT"));

if (USE_POSTGRES) {
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_quiz_results_project ON quiz_results(project_id, created_at);`);
}

async function logApiCall(userId, action, usage, durationMs) {
  if (!userId) return;
  try {
    const sql = `INSERT INTO quiz_api_logs (id, user_id, action, model, input_tokens, output_tokens, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      nanoid(16),
      userId,
      action,
      AI_MODEL,
      usage?.input_tokens || 0,
      usage?.output_tokens || 0,
      durationMs || 0,
      new Date().toISOString(),
    ];
    await dbRun(sql, params);
  } catch (err) {
    console.error("[quizall] Failed to log API call:", err.message);
  }
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeWhitespace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function normalizeType(type) {
  const raw = String(type || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "mcq" || raw === "multiplechoice") return "multiple_choice";
  if (raw === "tf" || raw === "truefalse") return "true_false";
  if (raw === "fib" || raw === "fill_in_blank") return "fill_in_the_blank";
  if (raw === "frq" || raw === "short_answer" || raw === "free_text") return "free_response";
  return raw;
}

function normalizeDifficulty(value) {
  const v = String(value || "medium").toLowerCase();
  if (v === "easy" || v === "medium" || v === "hard") return v;
  return "medium";
}

function normalizeBloom(value) {
  const v = String(value || "understand").toLowerCase();
  const valid = new Set(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
  return valid.has(v) ? v : "understand";
}

function normalizeBooleanString(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "t" || text === "1" || text === "yes" ? "true" : "false";
}

function parseCorrectIndex(correctAnswer, options = []) {
  if (typeof correctAnswer === "number" && Number.isFinite(correctAnswer)) {
    if (correctAnswer >= 0 && correctAnswer < options.length) return correctAnswer;
  }

  const text = String(correctAnswer ?? "").trim();
  if (!text) return 0;

  const letter = text.match(/^([A-H])[\).\s-]?/i);
  if (letter) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }

  const numeric = Number.parseInt(text, 10);
  if (Number.isInteger(numeric)) {
    if (numeric >= 0 && numeric < options.length) return numeric;
    if (numeric >= 1 && numeric <= options.length) return numeric - 1;
  }

  const exactIdx = options.findIndex((opt) => normalizeWhitespace(opt).toLowerCase() === normalizeWhitespace(text).toLowerCase());
  if (exactIdx >= 0) return exactIdx;

  return 0;
}

function buildQuestionTip(type) {
  const normalized = normalizeType(type || "multiple_choice");
  if (normalized === "multiple_choice") {
    return "Tip: Eliminate two weak options first, then choose the best-supported answer from the source.";
  }
  if (normalized === "true_false") {
    return "Tip: If one keyword makes the statement inaccurate, mark False and justify it with one source detail.";
  }
  if (normalized === "fill_in_the_blank") {
    return "Tip: Use the exact course terminology; short and precise answers score best.";
  }
  return "Tip: Structure your response as definition -> key mechanism -> one concrete example.";
}

function normalizeQuestion(rawQuestion, allowedTypes, fallbackTopic, fallbackSource) {
  const q = rawQuestion || {};
  let type = normalizeType(q.type || q.question_type || "multiple_choice");
  if (!allowedTypes.includes(type)) {
    type = allowedTypes.includes("free_response") ? "free_response" : allowedTypes[0] || "multiple_choice";
  }

  const questionText = normalizeWhitespace(q.question || q.text || q.prompt || "");
  let options = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [];
  options = options.map((opt) => normalizeWhitespace(typeof opt === "string" ? opt : opt?.text || opt?.label || "")).filter(Boolean);

  let correctAnswer;
  if (type === "multiple_choice") {
    if (options.length < 2) {
      options = ["Option A", "Option B", "Option C", "Option D"];
    }
    correctAnswer = parseCorrectIndex(q.correct_answer ?? q.correctAnswer ?? q.correct, options);
  } else if (type === "true_false") {
    options = null;
    correctAnswer = normalizeBooleanString(q.correct_answer ?? q.correctAnswer ?? q.correct);
  } else {
    options = null;
    correctAnswer = normalizeWhitespace(q.correct_answer ?? q.correctAnswer ?? q.correct ?? "");
  }

  return {
    type,
    question: questionText || "Question unavailable",
    options,
    correct_answer: correctAnswer,
    explanation: normalizeWhitespace(q.explanation || ""),
    tip: normalizeWhitespace(q.tip || q.hint || q.strategy || buildQuestionTip(type)),
    difficulty: normalizeDifficulty(q.difficulty),
    bloom_level: normalizeBloom(q.bloom_level || q.bloomLevel),
    topic_node: normalizeWhitespace(q.topic_node || q.topic || fallbackTopic || "General"),
    source_reference: normalizeWhitespace(q.source_reference || q.source || q.sourceReference || fallbackSource || "Project materials"),
  };
}

function computeAccuracyPercent(score, total) {
  const s = Number(score);
  const t = Number(total);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) return 0;
  if (s > t) {
    const bounded = Math.max(0, Math.min(100, Math.round(s)));
    return bounded;
  }
  return Math.max(0, Math.min(100, Math.round((s / t) * 100)));
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token && token.length >= 2);
}

function splitIntoChunks(text, maxLen = 650) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return [];

  const chunks = [];
  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      chunks.push(para);
      continue;
    }

    let cursor = 0;
    while (cursor < para.length) {
      const slice = para.slice(cursor, cursor + maxLen);
      chunks.push(slice.trim());
      cursor += Math.floor(maxLen * 0.85);
    }
  }
  return chunks;
}

function scoreTextByTerms(text, terms) {
  if (!text || !terms.length) return 0;
  const lowered = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (lowered.includes(term)) {
      score += term.length >= 8 ? 4 : 2;
    }
  }
  return score;
}

function outlineCandidateScore(fileName, content) {
  const name = String(fileName || "").toLowerCase();
  const sample = String(content || "").slice(0, 5000).toLowerCase();
  let score = 0;
  for (const keyword of OUTLINE_KEYWORDS) {
    if (name.includes(keyword)) score += 6;
    if (sample.includes(keyword)) score += 2;
  }
  if (/final|midterm|exam/i.test(name)) score += 2;
  return score;
}

function buildOutlineCandidates(files) {
  return (files || [])
    .map((file) => {
      const score = outlineCandidateScore(file.file_name, file.content);
      return {
        id: file.id,
        fileName: file.file_name,
        createdAt: file.created_at,
        score,
        preview: normalizeWhitespace(String(file.content || "").slice(0, 180)),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function extractTopics(rawTopicsText, fallbackFileContent = "") {
  const lines = String(rawTopicsText || "")
    .split(/\n|;|；|,|，|\||、/)
    .map((line) => line.replace(/^\s*(\d+[\).]?|[-*•])\s*/, "").trim())
    .filter(Boolean);

  const topics = [];
  const seen = new Set();
  for (const line of lines) {
    const normalized = normalizeWhitespace(line);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(normalized);
    if (topics.length >= 10) break;
  }

  if (topics.length >= 3) return topics;

  const corpusTokens = tokenize(fallbackFileContent);
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "exam", "review", "chapter", "topic", "课程", "考试"]);
  const freq = new Map();
  for (const token of corpusTokens) {
    if (token.length < 4 || stop.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  const derived = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token.charAt(0).toUpperCase() + token.slice(1));

  for (const item of derived) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(item);
    if (topics.length >= 10) break;
  }

  if (!topics.length) {
    return ["Core concepts", "Important definitions", "Problem solving patterns"];
  }

  return topics;
}

function buildRagPack(files, topicText, perTopic = 2) {
  const terms = tokenize(topicText).slice(0, 30);
  if (!terms.length) return { snippets: [], byTopic: {} };

  const snippets = [];
  for (const file of files || []) {
    const chunks = splitIntoChunks(file.content || "", 720);
    chunks.forEach((chunk, idx) => {
      const score = scoreTextByTerms(chunk, terms);
      if (score <= 0) return;
      snippets.push({
        fileName: file.file_name,
        text: chunk,
        score,
        sourceId: `${file.file_name}#${idx + 1}`,
      });
    });
  }

  snippets.sort((a, b) => b.score - a.score);

  const byTopic = {};
  const topics = extractTopics(topicText);
  for (const topic of topics) {
    const topicTerms = tokenize(topic);
    const ranked = snippets
      .map((snippet) => ({ ...snippet, topicScore: scoreTextByTerms(snippet.text, topicTerms) + snippet.score * 0.35 }))
      .filter((item) => item.topicScore > 0)
      .sort((a, b) => b.topicScore - a.topicScore)
      .slice(0, perTopic)
      .map((item) => ({
        source: item.sourceId,
        fileName: item.fileName,
        text: item.text,
      }));
    byTopic[topic] = ranked;
  }

  return {
    snippets: snippets.slice(0, 16).map((snippet) => ({
      source: snippet.sourceId,
      fileName: snippet.fileName,
      text: snippet.text,
    })),
    byTopic,
  };
}

function buildSourcePackString(snippets) {
  if (!Array.isArray(snippets) || !snippets.length) return "";
  return snippets
    .map((snippet, idx) => `[S${idx + 1}] ${snippet.source}\n${snippet.text}`)
    .join("\n\n");
}

function toDateKey(dateInput, timezone = "UTC") {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!date || Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function buildRecentDateKeys(days, timezone = "UTC") {
  const keys = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = toDateKey(date, timezone);
    if (!key) continue;
    keys.push(key);
  }
  return keys;
}

function computeStreak(days, intensityByDate) {
  if (!days.length) return { currentStreak: 0, maxStreak: 0 };

  let maxStreak = 0;
  let rolling = 0;
  for (const day of days) {
    if ((intensityByDate.get(day) || 0) > 0) {
      rolling += 1;
      if (rolling > maxStreak) maxStreak = rolling;
    } else {
      rolling = 0;
    }
  }

  const reversed = [...days].reverse();
  let startIndex = 0;
  if ((intensityByDate.get(reversed[0]) || 0) === 0 && reversed[1]) {
    startIndex = 1;
  }

  let currentStreak = 0;
  for (let i = startIndex; i < reversed.length; i++) {
    if ((intensityByDate.get(reversed[i]) || 0) > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return { currentStreak, maxStreak };
}

function normalizeUserAnswer(answer) {
  if (answer == null) return "";
  if (typeof answer === "boolean") return answer ? "true" : "false";
  if (typeof answer === "number") return String(answer);
  if (typeof answer === "string") return answer.trim();
  return JSON.stringify(answer);
}

function evaluateAnswer(type, userAnswer, correctAnswer) {
  const normalizedType = normalizeType(type);

  if (normalizedType === "multiple_choice") {
    const userIndex = Number.parseInt(String(userAnswer), 10);
    const correctIndex = Number.parseInt(String(correctAnswer), 10);
    return Number.isInteger(userIndex) && Number.isInteger(correctIndex) && userIndex === correctIndex;
  }

  if (normalizedType === "true_false") {
    return normalizeBooleanString(userAnswer) === normalizeBooleanString(correctAnswer);
  }

  const user = normalizeWhitespace(userAnswer).toLowerCase();
  const expected = normalizeWhitespace(correctAnswer).toLowerCase();
  if (!user || !expected) return false;

  if (normalizedType === "free_response") {
    const expectedTokens = tokenize(expected).filter((token) => token.length >= 4);
    if (expectedTokens.length === 0) return user === expected;
    const hitCount = expectedTokens.filter((token) => user.includes(token)).length;
    return hitCount >= Math.max(1, Math.ceil(expectedTokens.length * 0.5));
  }

  return user === expected;
}

function buildAnalysisPrompt(content, examTopicHint = "") {
  return {
    system: [
      "You are an expert educator. Analyze the study material and extract the concepts students should be tested on.",
      examTopicHint ? `Prioritize these exam topics: ${examTopicHint}` : "",
      "Return a JSON object with this exact structure:",
      '{ "subject": "string", "topics": ["array of topic strings"], "key_concepts": [{ "concept": "string", "detail": "string", "difficulty": "easy|medium|hard" }] }',
    ]
      .filter(Boolean)
      .join("\n"),
    user: content,
  };
}

function buildMockAnalysis(content, examTopicHint = "", projectName = "") {
  const topics = extractTopics(examTopicHint || content).slice(0, 8);
  const subject = normalizeWhitespace(projectName || topics[0] || "Exam Prep");
  const key_concepts = topics.slice(0, 6).map((topic, index) => ({
    concept: topic,
    detail: `Core idea for ${topic} based on uploaded materials.`,
    difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
  }));

  return {
    subject,
    topics: topics.length ? topics : ["Core concepts", "Important definitions", "Applications"],
    key_concepts,
  };
}

function buildMockQuiz(analysis, allowedTypes, numQuestions, ragSnippets, fallbackSource) {
  const topics = Array.isArray(analysis?.topics) && analysis.topics.length ? analysis.topics : ["General"];
  const sources = Array.isArray(ragSnippets) && ragSnippets.length
    ? ragSnippets.map((item) => item.source || item.fileName || fallbackSource)
    : [fallbackSource];

  const bloomLevels = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
  const difficulties = ["easy", "medium", "hard"];

  const typeQueue = [];
  if (allowedTypes.includes("free_response")) {
    const frqCount = Math.max(1, Math.ceil(numQuestions * 0.4));
    for (let i = 0; i < frqCount; i++) typeQueue.push("free_response");
  }
  while (typeQueue.length < numQuestions) {
    typeQueue.push(allowedTypes[typeQueue.length % allowedTypes.length] || "multiple_choice");
  }

  return typeQueue.slice(0, numQuestions).map((type, index) => {
    const topic = topics[index % topics.length];
    const source = sources[index % sources.length] || fallbackSource;
    const difficulty = difficulties[index % difficulties.length];
    const bloom = bloomLevels[index % bloomLevels.length];

    if (type === "multiple_choice") {
      return {
        type,
        question: `Which option best describes ${topic}?`,
        options: [
          `${topic} as explained in the course materials`,
          "An unrelated concept from another domain",
          "A definition that conflicts with the material",
          "A random fact not tied to this exam topic",
        ],
        correct_answer: 0,
        explanation: `${topic} is explicitly emphasized in your selected exam scope.`,
        difficulty,
        bloom_level: bloom,
        topic_node: topic,
        source_reference: source,
      };
    }

    if (type === "true_false") {
      return {
        type,
        question: `${topic} is one of the exam topics to prioritize for this project.`,
        options: null,
        correct_answer: "true",
        explanation: `${topic} appears in the exam-topic set and should be reviewed.`,
        difficulty,
        bloom_level: bloom,
        topic_node: topic,
        source_reference: source,
      };
    }

    if (type === "fill_in_the_blank") {
      const answer = topic.split(/\s+/)[0] || topic;
      return {
        type,
        question: `A high-priority topic in this project is ___ (${topic}).`,
        options: null,
        correct_answer: answer,
        explanation: `This blank points to the topic label used for this exam plan.`,
        difficulty,
        bloom_level: bloom,
        topic_node: topic,
        source_reference: source,
      };
    }

    return {
      type: "free_response",
      question: `Explain ${topic} in your own words, then give one practical example likely to appear on the exam.`,
      options: null,
      correct_answer: `A strong answer should define ${topic} and provide one clear application/example.`,
      explanation: `Free-response strengthens active retrieval and topic transfer.`,
      difficulty,
      bloom_level: bloom,
      topic_node: topic,
      source_reference: source,
    };
  });
}

function buildQuizPrompt(content, analysis, types, numQuestions, sourcePack) {
  const typeList = types.join(", ");
  const frqPriority = types.includes("free_response")
    ? "If free_response is allowed, generate at least 40% free_response questions first, then fill the rest with other types."
    : "";

  return {
    system: [
      "You are an expert quiz generator for exam prep.",
      `Generate exactly ${numQuestions} quiz questions using ONLY these question types: ${typeList}.`,
      frqPriority,
      "Use Bloom's Taxonomy levels across questions for balanced cognitive depth.",
      "Return a JSON array where each element has:",
      "{",
      '  "type": "multiple_choice" | "true_false" | "fill_in_the_blank" | "free_response",',
      '  "question": "string",',
      '  "options": ["A", "B", "C", "D"] for multiple_choice only; otherwise null,',
      '  "correct_answer": "string or option index for multiple_choice",',
      '  "explanation": "brief explanation",',
      '  "tip": "one concise solving tip for learners",',
      '  "difficulty": "easy" | "medium" | "hard",',
      '  "bloom_level": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",',
      '  "topic_node": "topic label",',
      '  "source_reference": "must cite one source id like S1, S2 with file hint"',
      "}",
      "For true_false, correct_answer must be exactly 'true' or 'false'.",
      "For fill_in_the_blank, include a blank marker as '___'.",
      "Every question must include a source_reference.",
    ]
      .filter(Boolean)
      .join("\n"),
    user: [
      "=== CONTENT ANALYSIS ===",
      JSON.stringify(analysis, null, 2),
      "",
      sourcePack ? "=== SOURCE PACK (RAG) ===" : "",
      sourcePack || "",
      sourcePack ? "" : "",
      "=== STUDY MATERIAL ===",
      content,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function getProjectForUser(projectId, userId) {
  return await dbGet(
    `SELECT id, user_id, name, exam_name, exam_date, description, created_at, updated_at
     FROM study_projects
     WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
}

async function getProjectFiles(projectId, userId) {
  return await dbAll(
    `SELECT id, project_id, user_id, file_name, mime_type, content, content_length, is_outline_candidate, created_at
     FROM project_files
     WHERE project_id = ? AND user_id = ?
     ORDER BY created_at DESC`,
    [projectId, userId]
  );
}

async function touchProject(projectId) {
  if (!projectId) return;
  await dbRun(`UPDATE study_projects SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), projectId]);
}

async function saveProjectExamPrepRecord({
  projectId,
  userId,
  examTopics,
  topicsSource,
  selectedFileId,
  mindmap,
  generatedAt,
  updatedAt,
}) {
  const existing = await dbGet(
    `SELECT id FROM project_exam_prep WHERE project_id = ? AND user_id = ? LIMIT 1`,
    [projectId, userId]
  );

  if (existing?.id) {
    await dbRun(
      `UPDATE project_exam_prep
       SET exam_topics = ?,
           topics_source = ?,
           selected_file_id = ?,
           mindmap_json = ?,
           generated_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [examTopics, topicsSource, selectedFileId, JSON.stringify(mindmap), generatedAt, updatedAt, existing.id]
    );
    return existing.id;
  }

  const prepId = nanoid(16);
  await dbRun(
    `INSERT INTO project_exam_prep (id, project_id, user_id, exam_topics, topics_source, selected_file_id, mindmap_json, generated_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [prepId, projectId, userId, examTopics, topicsSource, selectedFileId, JSON.stringify(mindmap), generatedAt, updatedAt]
  );
  return prepId;
}

function normalizeGeneratedQuizPayload(raw, allowedTypes, fallbackTopics, fallbackSource) {
  let questions = raw;
  if (!Array.isArray(questions)) {
    questions = raw?.questions || raw?.quiz || [];
  }

  if (!Array.isArray(questions)) return [];

  return questions.map((q, idx) => normalizeQuestion(q, allowedTypes, fallbackTopics[idx % fallbackTopics.length], fallbackSource));
}

async function getTopicAccuracyMap(userId, projectId) {
  const correctCountExpr = USE_POSTGRES
    ? "SUM(CASE WHEN qq.is_correct IS TRUE THEN 1 ELSE 0 END)"
    : "SUM(CASE WHEN qq.is_correct = 1 THEN 1 ELSE 0 END)";
  const rows = await dbAll(
    `SELECT qq.topic_node AS topic_node,
            ${correctCountExpr} AS correct_count,
            COUNT(*) AS total_count
     FROM quiz_questions qq
     JOIN quiz_results qr ON qr.id = qq.result_id
     WHERE qr.user_id = ?
       AND qr.project_id = ?
       AND qq.topic_node IS NOT NULL
       AND qq.topic_node <> ''
     GROUP BY qq.topic_node`,
    [userId, projectId]
  );

  const map = new Map();
  for (const row of rows) {
    const topic = normalizeWhitespace(row.topic_node);
    if (!topic) continue;
    const total = Number(row.total_count) || 0;
    const correct = Number(row.correct_count) || 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    map.set(topic.toLowerCase(), { accuracy, total });
  }
  return map;
}

function statusFromAccuracy(accuracyEntry) {
  if (!accuracyEntry || !Number.isFinite(accuracyEntry.accuracy)) return "gray";
  const accuracy = accuracyEntry.accuracy;
  if (accuracy >= 80) return "green";
  if (accuracy >= 60) return "yellow";
  return "red";
}

function buildMindmap(project, topics, ragByTopic, topicAccuracyMap) {
  const now = new Date().toISOString();
  const titleBase = normalizeWhitespace(project.exam_name || project.name || "Exam");
  const nodes = topics.map((topic) => {
    const accuracyEntry = topicAccuracyMap.get(topic.toLowerCase());
    const snippets = ragByTopic[topic] || [];
    const children = snippets.map((snippet) => ({
      id: nanoid(8),
      text: normalizeWhitespace(snippet.text.slice(0, 110)),
      source: snippet.source,
      status: statusFromAccuracy(accuracyEntry),
      children: [],
    }));

    if (!children.length) {
      children.push({
        id: nanoid(8),
        text: "Add key details here",
        source: null,
        status: statusFromAccuracy(accuracyEntry),
        children: [],
      });
    }

    return {
      id: nanoid(8),
      text: topic,
      status: statusFromAccuracy(accuracyEntry),
      accuracy: accuracyEntry?.accuracy ?? null,
      children,
    };
  });

  return {
    id: nanoid(10),
    title: `${titleBase} ExamTopics`,
    generatedAt: now,
    examName: normalizeWhitespace(project.exam_name || project.name || "Exam"),
    examDate: project.exam_date || null,
    message: "This mindmap was made specifically for your exam.",
    nodes,
  };
}

function buildExamPrepNudge() {
  return {
    nudge: "Tell us your exam topics and question quality can improve up to 8x.",
    emailTemplate: [
      "Subject: Quick question about exam focus topics",
      "",
      "Hi Professor [Last Name],",
      "I am preparing for the upcoming exam and want to make sure I focus on the most important topics.",
      "Could you share the key chapters/concepts you recommend we prioritize?",
      "",
      "Thank you for your time!",
      "[Your Name]",
    ].join("\n"),
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Project System
// ────────────────────────────────────────────────────────────────────────────────

quizRouter.get("/projects", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const limit = Math.min(PROJECT_MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));

    const rows = await dbAll(
      `SELECT sp.id, sp.name, sp.exam_name, sp.exam_date, sp.description, sp.created_at, sp.updated_at,
              (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = sp.id) AS file_count,
              (SELECT COUNT(*) FROM quiz_results qr WHERE qr.project_id = sp.id AND qr.user_id = sp.user_id) AS quiz_count,
              (SELECT qr.score FROM quiz_results qr WHERE qr.project_id = sp.id AND qr.user_id = sp.user_id ORDER BY qr.created_at DESC LIMIT 1) AS latest_score,
              (SELECT qr.total FROM quiz_results qr WHERE qr.project_id = sp.id AND qr.user_id = sp.user_id ORDER BY qr.created_at DESC LIMIT 1) AS latest_total
       FROM study_projects sp
       WHERE sp.user_id = ?
       ORDER BY sp.updated_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    const projects = rows.map((row) => ({
      id: row.id,
      name: row.name,
      examName: row.exam_name,
      examDate: row.exam_date,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fileCount: Number(row.file_count) || 0,
      quizCount: Number(row.quiz_count) || 0,
      latestAccuracy: computeAccuracyPercent(row.latest_score, row.latest_total),
    }));

    return res.json({ ok: true, projects });
  } catch (err) {
    console.error("[quizall] projects list error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load projects" });
  }
});

quizRouter.post("/projects", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const name = normalizeWhitespace(req.body?.name || "");
    const examName = normalizeWhitespace(req.body?.examName || "");
    const examDate = normalizeWhitespace(req.body?.examDate || "");
    const description = normalizeWhitespace(req.body?.description || "");

    if (!name || name.length < 2 || name.length > 120) {
      return res.status(400).json({ ok: false, error: "Project name must be 2-120 characters" });
    }

    const projectId = nanoid(16);
    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO study_projects (id, user_id, name, exam_name, exam_date, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, userId, name, examName || name, examDate || null, description || null, now, now]
    );

    return res.status(201).json({
      ok: true,
      project: {
        id: projectId,
        name,
        examName: examName || name,
        examDate: examDate || null,
        description: description || null,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    console.error("[quizall] projects create error:", err);
    return res.status(500).json({ ok: false, error: "Failed to create project" });
  }
});

quizRouter.get("/projects/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;

    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const files = await getProjectFiles(projectId, userId);
    const examPrepRow = await dbGet(
      `SELECT exam_topics, topics_source, selected_file_id, mindmap_json, generated_at, updated_at
       FROM project_exam_prep
       WHERE project_id = ? AND user_id = ?`,
      [projectId, userId]
    );

    const trendRows = await dbAll(
      `SELECT id, score, total, created_at
       FROM quiz_results
       WHERE user_id = ? AND project_id = ?
       ORDER BY created_at ASC
       LIMIT 50`,
      [userId, projectId]
    );

    return res.json({
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        examName: project.exam_name,
        examDate: project.exam_date,
        description: project.description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
      files: files.map((file) => ({
        id: file.id,
        fileName: file.file_name,
        mimeType: file.mime_type,
        contentLength: file.content_length,
        isOutlineCandidate: Number(file.is_outline_candidate) === 1,
        createdAt: file.created_at,
      })),
      examPrep: examPrepRow
        ? {
            examTopics: examPrepRow.exam_topics,
            topicsSource: examPrepRow.topics_source,
            selectedFileId: examPrepRow.selected_file_id,
            mindmap: safeJsonParse(examPrepRow.mindmap_json, null),
            generatedAt: examPrepRow.generated_at,
            updatedAt: examPrepRow.updated_at,
          }
        : null,
      analytics: {
        trend: trendRows.map((row) => ({
          id: row.id,
          date: row.created_at,
          accuracy: computeAccuracyPercent(row.score, row.total),
        })),
      },
    });
  } catch (err) {
    console.error("[quizall] projects detail error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load project" });
  }
});

quizRouter.post("/projects/:id/files", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;
    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const inputFiles = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!inputFiles.length) {
      return res.status(400).json({ ok: false, error: "No files provided" });
    }
    if (inputFiles.length > MAX_FILE_BATCH) {
      return res.status(400).json({ ok: false, error: `Upload at most ${MAX_FILE_BATCH} files per request` });
    }

    const now = new Date().toISOString();
    const inserted = [];

    for (const file of inputFiles) {
      const fileName = normalizeWhitespace(file?.name || file?.fileName || "Untitled");
      const mimeType = normalizeWhitespace(file?.mimeType || file?.type || "");
      const text = String(file?.text || "").trim();
      if (!text || text.length < 20) continue;

      const clippedText = text.slice(0, FILE_TEXT_MAX_LENGTH);
      const score = outlineCandidateScore(fileName, clippedText);
      const rowId = nanoid(16);

      await dbRun(
        `INSERT INTO project_files (id, project_id, user_id, file_name, mime_type, content, content_length, is_outline_candidate, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rowId, projectId, userId, fileName, mimeType || null, clippedText, clippedText.length, score > 0 ? 1 : 0, now]
      );

      inserted.push({
        id: rowId,
        fileName,
        contentLength: clippedText.length,
        isOutlineCandidate: score > 0,
        createdAt: now,
      });
    }

    await touchProject(projectId);

    return res.status(201).json({
      ok: true,
      files: inserted,
      skipped: inputFiles.length - inserted.length,
    });
  } catch (err) {
    console.error("[quizall] project files upload error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save files" });
  }
});

quizRouter.get("/projects/:id/outline-candidates", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;

    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const files = await getProjectFiles(projectId, userId);
    const candidates = buildOutlineCandidates(files);

    return res.json({
      ok: true,
      candidates,
      recommendedFileId: candidates[0]?.id || null,
      keywordSet: OUTLINE_KEYWORDS,
    });
  } catch (err) {
    console.error("[quizall] outline scan error:", err);
    return res.status(500).json({ ok: false, error: "Failed to scan outline candidates" });
  }
});

quizRouter.post("/projects/:id/exam-prep", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;
    const sourceMode = normalizeWhitespace(req.body?.sourceMode || "typed") || "typed";
    const selectedFileId = normalizeWhitespace(req.body?.selectedFileId || "") || null;
    const typedTopics = String(req.body?.topicsInput || "").trim();

    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const files = await getProjectFiles(projectId, userId);
    const fileById = new Map(files.map((file) => [file.id, file]));
    const candidateFile = selectedFileId ? fileById.get(selectedFileId) : null;
    const autoCandidates = buildOutlineCandidates(files);

    let examTopicsText = typedTopics;
    let resolvedMode = sourceMode;

    if (!examTopicsText && candidateFile) {
      examTopicsText = String(candidateFile.content || "").slice(0, 7000);
      resolvedMode = "file";
    }

    if (!examTopicsText && autoCandidates[0]) {
      const autoFile = fileById.get(autoCandidates[0].id);
      if (autoFile) {
        examTopicsText = String(autoFile.content || "").slice(0, 7000);
        resolvedMode = "auto";
      }
    }

    if (!examTopicsText || examTopicsText.length < 10) {
      return res.status(400).json({
        ok: false,
        error: "Please provide exam topics (typed or from a file) before generating mindmap.",
        ...buildExamPrepNudge(),
      });
    }

    const topics = extractTopics(examTopicsText, files.map((file) => file.content).join("\n\n"));
    const rag = buildRagPack(files, examTopicsText, 2);
    const topicAccuracyMap = await getTopicAccuracyMap(userId, projectId);
    const mindmap = buildMindmap(project, topics, rag.byTopic, topicAccuracyMap);

    const now = new Date().toISOString();
    await saveProjectExamPrepRecord({
      projectId,
      userId,
      examTopics: examTopicsText,
      topicsSource: resolvedMode,
      selectedFileId,
      mindmap,
      generatedAt: now,
      updatedAt: now,
    });

    await touchProject(projectId);

    return res.json({
      ok: true,
      projectId,
      sourceMode: resolvedMode,
      examTopics: examTopicsText,
      topics,
      ragByTopic: rag.byTopic,
      mindmap,
      ...buildExamPrepNudge(),
    });
  } catch (err) {
    console.error("[quizall] exam prep error:", err);
    return res.status(500).json({ ok: false, error: "Failed to generate exam prep mindmap" });
  }
});

quizRouter.put("/projects/:id/mindmap", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;
    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const mindmap = req.body?.mindmap;
    if (!mindmap || typeof mindmap !== "object") {
      return res.status(400).json({ ok: false, error: "Mindmap payload is required" });
    }

    const examTopics = normalizeWhitespace(req.body?.examTopics || "Updated topics");
    const now = new Date().toISOString();

    await saveProjectExamPrepRecord({
      projectId,
      userId,
      examTopics,
      topicsSource: "manual_edit",
      selectedFileId: null,
      mindmap,
      generatedAt: now,
      updatedAt: now,
    });

    await touchProject(projectId);

    return res.json({ ok: true, updatedAt: now });
  } catch (err) {
    console.error("[quizall] mindmap save error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save mindmap" });
  }
});

quizRouter.get("/projects/:id/analytics", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;

    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const rows = await dbAll(
      `SELECT id, score, total, created_at
       FROM quiz_results
       WHERE user_id = ? AND project_id = ?
       ORDER BY created_at ASC
       LIMIT 200`,
      [userId, projectId]
    );

    const trend = rows.map((row) => ({
      id: row.id,
      date: row.created_at,
      accuracy: computeAccuracyPercent(row.score, row.total),
    }));

    return res.json({
      ok: true,
      trend,
      latestAccuracy: trend.length ? trend[trend.length - 1].accuracy : null,
    });
  } catch (err) {
    console.error("[quizall] project analytics error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load project analytics" });
  }
});

quizRouter.get("/study-streak", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const days = Math.min(STREAK_MAX_DAYS, Math.max(14, Number.parseInt(req.query.days, 10) || 140));

    const user = await dbGet(`SELECT timezone FROM users WHERE id = ?`, [userId]);
    const timezone = normalizeWhitespace(user?.timezone || "UTC") || "UTC";

    const fileRows = await dbAll(
      `SELECT created_at
       FROM project_files
       WHERE user_id = ?`,
      [userId]
    );

    const quizRows = await dbAll(
      `SELECT score, total, created_at
       FROM quiz_results
       WHERE user_id = ?`,
      [userId]
    );

    const intensityByDate = new Map();

    for (const row of fileRows) {
      const key = toDateKey(row.created_at, timezone);
      if (!key) continue;
      intensityByDate.set(key, Math.max(intensityByDate.get(key) || 0, 1));
    }

    for (const row of quizRows) {
      const key = toDateKey(row.created_at, timezone);
      if (!key) continue;
      const accuracy = computeAccuracyPercent(row.score, row.total);
      const intensity = accuracy >= 80 ? 3 : 2;
      intensityByDate.set(key, Math.max(intensityByDate.get(key) || 0, intensity));
    }

    const dateKeys = buildRecentDateKeys(days, timezone);
    const heatmap = dateKeys.map((date) => ({ date, intensity: intensityByDate.get(date) || 0 }));
    const streak = computeStreak(dateKeys, intensityByDate);

    return res.json({
      ok: true,
      timezone,
      days,
      heatmap,
      currentStreak: streak.currentStreak,
      maxStreak: streak.maxStreak,
    });
  } catch (err) {
    console.error("[quizall] study streak error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load study streak" });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Quiz Generation
// ────────────────────────────────────────────────────────────────────────────────

quizRouter.post("/generate", optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.sub || null;
    const body = req.body || {};

    const requestedTypes = Array.isArray(body.types) ? body.types : [];
    if (!requestedTypes.length) {
      return res.status(400).json({ ok: false, error: "At least one question type is required" });
    }

    const normalizedTypes = requestedTypes.map((type) => normalizeType(type));
    const invalidTypes = normalizedTypes.filter((type) => !VALID_QUESTION_TYPES.has(type));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Invalid question type(s): ${invalidTypes.join(", ")}. Valid types: ${Array.from(VALID_QUESTION_TYPES).join(", ")}`,
      });
    }

    const numQuestions = Number.parseInt(body.numQuestions, 10);
    if (!Number.isInteger(numQuestions) || numQuestions < NUM_QUESTIONS_MIN || numQuestions > NUM_QUESTIONS_MAX) {
      return res.status(400).json({
        ok: false,
        error: `numQuestions must be an integer between ${NUM_QUESTIONS_MIN} and ${NUM_QUESTIONS_MAX}`,
      });
    }

    const projectId = normalizeWhitespace(body.projectId || "") || null;
    let project = null;
    let projectFiles = [];
    let projectExamTopics = "";

    if (projectId) {
      if (!userId) {
        return res.status(401).json({ ok: false, error: "Login required for project-based quiz generation" });
      }

      project = await getProjectForUser(projectId, userId);
      if (!project) {
        return res.status(404).json({ ok: false, error: "Project not found" });
      }

      projectFiles = await getProjectFiles(projectId, userId);
      const prep = await dbGet(
        `SELECT exam_topics FROM project_exam_prep WHERE project_id = ? AND user_id = ?`,
        [projectId, userId]
      );
      projectExamTopics = String(prep?.exam_topics || "").trim();
    }

    const typedContent = String(body.content || "").trim();
    const providedExamTopics = String(body.examTopics || "").trim();
    const examTopicHint = providedExamTopics || projectExamTopics;

    let rag = { snippets: [], byTopic: {} };
    if (projectFiles.length) {
      rag = buildRagPack(projectFiles, examTopicHint || typedContent, 2);
    }

    const sourcePackString = buildSourcePackString(rag.snippets);
    let content = typedContent;

    if ((!content || content.length < CONTENT_MIN_LENGTH) && sourcePackString) {
      content = sourcePackString;
    }

    if (!content || content.length < CONTENT_MIN_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `Content must be at least ${CONTENT_MIN_LENGTH} characters. Upload files or paste more content.`,
      });
    }

    const fallbackSource = project ? `${project.name} materials` : "Provided content";
    if (!ANTHROPIC_ENABLED && process.env.NODE_ENV !== "production") {
      const mockAnalysis = buildMockAnalysis(content, examTopicHint, project?.exam_name || project?.name || "");
      const mockQuiz = buildMockQuiz(mockAnalysis, normalizedTypes, numQuestions, rag.snippets, fallbackSource);
      const normalizedMockQuiz = normalizeGeneratedQuizPayload(
        mockQuiz,
        normalizedTypes,
        mockAnalysis.topics || ["General"],
        fallbackSource
      ).slice(0, numQuestions);

      if (projectId) await touchProject(projectId);

      return res.json({
        ok: true,
        project: project
          ? {
              id: project.id,
              name: project.name,
              examName: project.exam_name,
              examDate: project.exam_date,
            }
          : null,
        quiz: normalizedMockQuiz,
        analysis: mockAnalysis,
        sources: rag.snippets,
        meta: {
          requestedTypes: normalizedTypes,
          numQuestions,
          mock: true,
          reason: "Anthropic API key missing in development mode",
        },
      });
    }

    const analysisStart = Date.now();
    const analysisPrompt = buildAnalysisPrompt(content, examTopicHint);
    const analysisResult = await chatJsonAnthropic({
      system: analysisPrompt.system,
      user: analysisPrompt.user,
      model: AI_MODEL,
      maxTokens: 2048,
      temperature: 0.2,
    });
    const analysisDuration = Date.now() - analysisStart;

    const analysis = analysisResult.data;
    if (!analysis || !analysis.subject || !Array.isArray(analysis.topics)) {
      console.error("[quizall] Analysis returned unexpected structure:", JSON.stringify(analysis).slice(0, 220));
      return res.status(502).json({ ok: false, error: "AI analysis returned an unexpected format. Please try again." });
    }

    await logApiCall(userId, "generate:analysis", analysisResult.usage, analysisDuration);

    const quizStart = Date.now();
    const quizPrompt = buildQuizPrompt(content, analysis, normalizedTypes, numQuestions, sourcePackString);
    const quizResult = await chatJsonAnthropic({
      system: quizPrompt.system,
      user: quizPrompt.user,
      model: AI_MODEL,
      maxTokens: 4096,
      temperature: 0.45,
    });
    const quizDuration = Date.now() - quizStart;

    await logApiCall(userId, "generate:quiz", quizResult.usage, quizDuration);
    const fallbackTopics = Array.isArray(analysis.topics) && analysis.topics.length
      ? analysis.topics.map((topic) => normalizeWhitespace(topic)).filter(Boolean)
      : ["General"];

    const normalizedQuiz = normalizeGeneratedQuizPayload(
      quizResult.data,
      normalizedTypes,
      fallbackTopics,
      fallbackSource
    ).slice(0, numQuestions);

    if (!normalizedQuiz.length) {
      console.error("[quizall] Quiz generation returned no questions:", JSON.stringify(quizResult.data).slice(0, 220));
      return res.status(502).json({ ok: false, error: "AI failed to generate questions. Please try again." });
    }

    if (projectId) await touchProject(projectId);

    return res.json({
      ok: true,
      project: project
        ? {
            id: project.id,
            name: project.name,
            examName: project.exam_name,
            examDate: project.exam_date,
          }
        : null,
      quiz: normalizedQuiz,
      analysis: {
        subject: analysis.subject,
        topics: analysis.topics,
        key_concepts: Array.isArray(analysis.key_concepts) ? analysis.key_concepts : [],
      },
      sources: rag.snippets,
      meta: {
        requestedTypes: normalizedTypes,
        numQuestions,
      },
    });
  } catch (err) {
    console.error("[quizall] generate error:", err);
    if (err.code === "ANTHROPIC_DISABLED") {
      return res.status(503).json({ ok: false, error: "AI service is currently unavailable" });
    }
    if (err.status === 429) {
      const retrySec = err.headers?.get?.("retry-after") || 60;
      return res.status(429).json({
        ok: false,
        error: "AI rate limit reached. Please try again in a minute or reduce the content length.",
        retryAfter: Number.parseInt(String(retrySec), 10) || 60,
      });
    }
    return res.status(500).json({ ok: false, error: "Quiz generation failed" });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Quiz History
// ────────────────────────────────────────────────────────────────────────────────

quizRouter.get("/history", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = normalizeWhitespace(req.query.projectId || "") || null;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(HISTORY_MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = ["qr.user_id = ?"];
    const params = [userId];
    if (projectId) {
      where.push("qr.project_id = ?");
      params.push(projectId);
    }

    const whereSql = where.join(" AND ");

    const countRow = await dbGet(`SELECT COUNT(*) AS total FROM quiz_results qr WHERE ${whereSql}`, params);

    const rows = await dbAll(
      `SELECT qr.id, qr.project_id, sp.name AS project_name, qr.subject, qr.score, qr.total, qr.topics, qr.elapsed, qr.created_at,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.result_id = qr.id) AS question_count
       FROM quiz_results qr
       LEFT JOIN study_projects sp ON sp.id = qr.project_id
       WHERE ${whereSql}
       ORDER BY qr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const results = rows.map((row) => ({
      id: row.id,
      projectId: row.project_id || null,
      projectName: row.project_name || null,
      subject: row.subject,
      score: Number(row.score) || 0,
      total: Number(row.total) || 0,
      accuracy: computeAccuracyPercent(row.score, row.total),
      questionCount: Number(row.question_count) || 0,
      topics: safeJsonParse(row.topics, []),
      elapsed: Number(row.elapsed) || null,
      createdAt: row.created_at,
    }));

    const total = Number(countRow?.total) || 0;

    return res.json({
      ok: true,
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (err) {
    console.error("[quizall] history GET error:", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch quiz history" });
  }
});

quizRouter.post("/history", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const payload = req.body || {};

    const projectId = normalizeWhitespace(payload.projectId || payload.project_id || "") || null;
    if (projectId) {
      const project = await getProjectForUser(projectId, userId);
      if (!project) {
        return res.status(404).json({ ok: false, error: "Project not found" });
      }
    }

    const questionsInput = Array.isArray(payload.questions)
      ? payload.questions
      : Array.isArray(payload.results)
      ? payload.results
      : [];

    if (!questionsInput.length) {
      return res.status(400).json({ ok: false, error: "Questions array is required" });
    }

    const total = Number.isInteger(payload.total) ? payload.total : questionsInput.length;
    if (!Number.isInteger(total) || total < 1) {
      return res.status(400).json({ ok: false, error: "Valid total question count is required" });
    }

    let correct = Number.isInteger(payload.correct) ? payload.correct : null;
    const scoreValue = Number.isInteger(payload.score) ? payload.score : null;

    if (correct == null) {
      if (scoreValue != null && scoreValue <= total) {
        correct = scoreValue;
      } else if (scoreValue != null && scoreValue >= 0 && scoreValue <= 100) {
        correct = Math.round((scoreValue / 100) * total);
      }
    }

    const rawAnswers = payload.answers;
    const answerMap = new Map();

    if (Array.isArray(rawAnswers)) {
      rawAnswers.forEach((answer, idx) => {
        if (answer && typeof answer === "object" && answer.questionIndex != null) {
          answerMap.set(Number(answer.questionIndex), answer.answer ?? answer.userAnswer ?? answer.value);
        } else {
          answerMap.set(idx, answer?.answer ?? answer);
        }
      });
    } else if (rawAnswers && typeof rawAnswers === "object") {
      Object.keys(rawAnswers).forEach((key) => {
        answerMap.set(Number(key), rawAnswers[key]);
      });
    }

    const normalizedQuestions = questionsInput.map((raw, index) => {
      const type = normalizeType(raw.type || raw.question_type || "multiple_choice");
      const options = Array.isArray(raw.options) ? raw.options : Array.isArray(raw.choices) ? raw.choices : null;
      const correctAnswer = raw.correct_answer ?? raw.correctAnswer ?? raw.correct ?? "";
      const userAnswer = answerMap.has(index)
        ? answerMap.get(index)
        : raw.userAnswer ?? raw.user_answer ?? null;
      const computedCorrect = raw.isCorrect ?? raw.is_correct ?? evaluateAnswer(type, userAnswer, correctAnswer);

      return {
        type,
        question: normalizeWhitespace(raw.question || raw.text || ""),
        options: options ? options.map((item) => normalizeWhitespace(item)) : null,
        correctAnswer,
        userAnswer,
        isCorrect: Boolean(computedCorrect),
        explanation: normalizeWhitespace(raw.explanation || ""),
        sourceReference: normalizeWhitespace(raw.source_reference || raw.sourceReference || raw.source || ""),
        topicNode: normalizeWhitespace(raw.topic_node || raw.topic || "General"),
        difficulty: normalizeDifficulty(raw.difficulty),
        bloomLevel: normalizeBloom(raw.bloom_level || raw.bloomLevel),
      };
    });

    if (correct == null) {
      correct = normalizedQuestions.reduce((sum, question) => sum + (question.isCorrect ? 1 : 0), 0);
    }

    if (correct < 0 || correct > total) {
      return res.status(400).json({ ok: false, error: "Correct count must be between 0 and total" });
    }

    const now = new Date().toISOString();
    const elapsedMs = Number.isFinite(payload.elapsed)
      ? Math.max(0, Math.round(payload.elapsed))
      : Number.isFinite(payload.timeSeconds)
      ? Math.max(0, Math.round(payload.timeSeconds * 1000))
      : Number.isFinite(payload.timeTaken)
      ? Math.max(0, Math.round(payload.timeTaken))
      : null;

    const subject = normalizeWhitespace(payload.subject || payload.title || "Untitled Quiz") || "Untitled Quiz";
    const topics = Array.isArray(payload.topics) ? payload.topics : [];

    const resultId = nanoid(16);

    await dbRun(
      `INSERT INTO quiz_results (id, user_id, project_id, subject, score, total, topics, elapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [resultId, userId, projectId, subject, correct, total, topics.length ? JSON.stringify(topics) : null, elapsedMs, now]
    );

    for (let i = 0; i < normalizedQuestions.length; i++) {
      const question = normalizedQuestions[i];
      await dbRun(
        `INSERT INTO quiz_questions (id, result_id, type, question, options, correct_answer, user_answer, is_correct, explanation, order_index, source_reference, topic_node, difficulty, bloom_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nanoid(16),
          resultId,
          question.type,
          question.question,
          question.options ? JSON.stringify(question.options) : null,
          typeof question.correctAnswer === "string" ? question.correctAnswer : JSON.stringify(question.correctAnswer),
          normalizeUserAnswer(question.userAnswer),
          question.isCorrect ? 1 : 0,
          question.explanation || null,
          i,
          question.sourceReference || null,
          question.topicNode || null,
          question.difficulty || null,
          question.bloomLevel || null,
        ]
      );
    }

    if (projectId) await touchProject(projectId);

    return res.status(201).json({ ok: true, id: resultId });
  } catch (err) {
    console.error("[quizall] history POST error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save quiz result" });
  }
});

quizRouter.delete("/history/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const resultId = req.params.id;

    const row = await dbGet("SELECT id, user_id, project_id FROM quiz_results WHERE id = ?", [resultId]);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Quiz result not found" });
    }
    if (row.user_id !== userId) {
      return res.status(403).json({ ok: false, error: "You can only delete your own quiz results" });
    }

    await dbRun("DELETE FROM quiz_questions WHERE result_id = ?", [resultId]);
    await dbRun("DELETE FROM quiz_results WHERE id = ?", [resultId]);
    if (row.project_id) await touchProject(row.project_id);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[quizall] history DELETE error:", err);
    return res.status(500).json({ ok: false, error: "Failed to delete quiz result" });
  }
});

quizRouter.delete("/history", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = normalizeWhitespace(req.query.projectId || req.body?.projectId || "") || null;

    if (projectId) {
      const project = await getProjectForUser(projectId, userId);
      if (!project) {
        return res.status(404).json({ ok: false, error: "Project not found" });
      }

      const rows = await dbAll(`SELECT id FROM quiz_results WHERE user_id = ? AND project_id = ?`, [userId, projectId]);
      for (const row of rows) {
        await dbRun(`DELETE FROM quiz_questions WHERE result_id = ?`, [row.id]);
      }
      await dbRun(`DELETE FROM quiz_results WHERE user_id = ? AND project_id = ?`, [userId, projectId]);
      await touchProject(projectId);

      return res.json({ ok: true, deleted: rows.length, scope: "project" });
    }

    const rows = await dbAll(`SELECT id FROM quiz_results WHERE user_id = ?`, [userId]);
    for (const row of rows) {
      await dbRun(`DELETE FROM quiz_questions WHERE result_id = ?`, [row.id]);
    }
    await dbRun(`DELETE FROM quiz_results WHERE user_id = ?`, [userId]);

    return res.json({ ok: true, deleted: rows.length, scope: "all" });
  } catch (err) {
    console.error("[quizall] history clear error:", err);
    return res.status(500).json({ ok: false, error: "Failed to clear quiz history" });
  }
});
