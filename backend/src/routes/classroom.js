import { Router } from "express";
import { nanoid } from "nanoid";
import { requireAuth } from "./auth.js";
import { USE_POSTGRES, dbGet, dbRun, dbAll } from "../lib/dbHelpers.js";
import { db } from "../lib/db.js";

export const classroomRouter = Router();

const MAX_CLASSES_NON_TEACHER = Number(process.env.CLASSROOM_MAX_FREE_CLASSES || 1);
const CLASS_NAME_MIN = 2;
const CLASS_NAME_MAX = 80;

const CLASSROOM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id);

CREATE TABLE IF NOT EXISTS classroom_members (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  CONSTRAINT uq_classroom_member UNIQUE (classroom_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_members_classroom ON classroom_members(classroom_id);
CREATE INDEX IF NOT EXISTS idx_members_student ON classroom_members(student_id);

CREATE TABLE IF NOT EXISTS classroom_assignments (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  exam_topics TEXT,
  num_questions INTEGER NOT NULL DEFAULT 10,
  due_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON classroom_assignments(classroom_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  classroom_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  submitted_at TEXT NOT NULL,
  CONSTRAINT uq_assignment_submission UNIQUE (assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);
`;

if (USE_POSTGRES) {
  await db.exec(CLASSROOM_SCHEMA_SQL);
} else {
  db.exec(CLASSROOM_SCHEMA_SQL);
}

function normalizeWhitespace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function generateJoinCode() {
  // Unambiguous uppercase alphanumerics (no O/0/I/1)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function getUserTier(userId) {
  try {
    const row = await dbGet(`SELECT subscription_tier, subscription_active FROM users WHERE id = ?`, [userId]);
    return {
      tier: row?.subscription_tier || "free",
      active: row?.subscription_active === true || row?.subscription_active === 1,
    };
  } catch {
    return { tier: "free", active: false };
  }
}

function isTeacherTier(tier) {
  return tier === "teacher";
}

function accuracyPercent(score, total) {
  const s = Number(score);
  const t = Number(total);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((s / t) * 100)));
}

// ────────────────────────────────────────────────────────────────
// Role
// ────────────────────────────────────────────────────────────────

classroomRouter.get("/role", requireAuth, async (req, res) => {
  try {
    const { tier } = await getUserTier(req.user.sub);
    const taughtRow = await dbGet(`SELECT COUNT(*) AS n FROM classrooms WHERE teacher_id = ?`, [req.user.sub]);
    const enrolledRow = await dbGet(`SELECT COUNT(*) AS n FROM classroom_members WHERE student_id = ?`, [req.user.sub]);
    return res.json({
      ok: true,
      tier,
      isTeacherTier: isTeacherTier(tier),
      taughtCount: Number(taughtRow?.n) || 0,
      enrolledCount: Number(enrolledRow?.n) || 0,
      maxFreeClasses: MAX_CLASSES_NON_TEACHER,
    });
  } catch (err) {
    console.error("[quizall] classroom role error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load classroom role" });
  }
});

// ────────────────────────────────────────────────────────────────
// Classes
// ────────────────────────────────────────────────────────────────

classroomRouter.get("/classes", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;

    const taught = await dbAll(
      `SELECT c.id, c.name, c.join_code, c.description, c.created_at,
              (SELECT COUNT(*) FROM classroom_members m WHERE m.classroom_id = c.id) AS member_count,
              (SELECT COUNT(*) FROM classroom_assignments a WHERE a.classroom_id = c.id) AS assignment_count
       FROM classrooms c
       WHERE c.teacher_id = ?
       ORDER BY c.created_at DESC`,
      [userId]
    );

    const enrolled = await dbAll(
      `SELECT c.id, c.name, c.description, c.created_at,
              (SELECT COUNT(*) FROM classroom_assignments a WHERE a.classroom_id = c.id) AS assignment_count
       FROM classrooms c
       JOIN classroom_members m ON m.classroom_id = c.id
       WHERE m.student_id = ?
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return res.json({
      ok: true,
      taught: taught.map((c) => ({
        id: c.id,
        name: c.name,
        joinCode: c.join_code,
        description: c.description,
        createdAt: c.created_at,
        memberCount: Number(c.member_count) || 0,
        assignmentCount: Number(c.assignment_count) || 0,
      })),
      enrolled: enrolled.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        createdAt: c.created_at,
        assignmentCount: Number(c.assignment_count) || 0,
      })),
    });
  } catch (err) {
    console.error("[quizall] classroom list error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load classes" });
  }
});

classroomRouter.post("/classes", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const name = normalizeWhitespace(req.body?.name || "");
    const description = normalizeWhitespace(req.body?.description || "");

    if (name.length < CLASS_NAME_MIN || name.length > CLASS_NAME_MAX) {
      return res.status(400).json({ ok: false, error: `Class name must be ${CLASS_NAME_MIN}-${CLASS_NAME_MAX} characters` });
    }

    const { tier } = await getUserTier(userId);
    if (!isTeacherTier(tier)) {
      const countRow = await dbGet(`SELECT COUNT(*) AS n FROM classrooms WHERE teacher_id = ?`, [userId]);
      if ((Number(countRow?.n) || 0) >= MAX_CLASSES_NON_TEACHER) {
        return res.status(402).json({
          ok: false,
          error: "upgrade_required",
          message: `The free plan allows ${MAX_CLASSES_NON_TEACHER} class. Upgrade to the Teacher plan for unlimited classes and student reports.`,
        });
      }
    }

    // Generate a unique join code
    let joinCode = generateJoinCode();
    for (let i = 0; i < 5; i++) {
      const exists = await dbGet(`SELECT id FROM classrooms WHERE join_code = ?`, [joinCode]);
      if (!exists) break;
      joinCode = generateJoinCode();
    }

    const id = nanoid(16);
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO classrooms (id, teacher_id, name, join_code, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, name, joinCode, description || null, now, now]
    );

    return res.status(201).json({
      ok: true,
      class: { id, name, joinCode, description: description || null, createdAt: now, memberCount: 0, assignmentCount: 0 },
    });
  } catch (err) {
    console.error("[quizall] classroom create error:", err);
    return res.status(500).json({ ok: false, error: "Failed to create class" });
  }
});

classroomRouter.delete("/classes/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const classId = req.params.id;
    const cls = await dbGet(`SELECT id, teacher_id FROM classrooms WHERE id = ?`, [classId]);
    if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
    if (cls.teacher_id !== userId) return res.status(403).json({ ok: false, error: "Not your class" });

    await dbRun(`DELETE FROM assignment_submissions WHERE classroom_id = ?`, [classId]);
    await dbRun(`DELETE FROM classroom_assignments WHERE classroom_id = ?`, [classId]);
    await dbRun(`DELETE FROM classroom_members WHERE classroom_id = ?`, [classId]);
    await dbRun(`DELETE FROM classrooms WHERE id = ?`, [classId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[quizall] classroom delete error:", err);
    return res.status(500).json({ ok: false, error: "Failed to delete class" });
  }
});

classroomRouter.post("/join", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const code = normalizeWhitespace(req.body?.code || "").toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: "A join code is required" });

    const cls = await dbGet(`SELECT id, teacher_id, name FROM classrooms WHERE join_code = ?`, [code]);
    if (!cls) return res.status(404).json({ ok: false, error: "No class found for that code" });
    if (cls.teacher_id === userId) {
      return res.status(400).json({ ok: false, error: "You are the teacher of this class" });
    }

    const existing = await dbGet(
      `SELECT id FROM classroom_members WHERE classroom_id = ? AND student_id = ?`,
      [cls.id, userId]
    );
    if (existing) {
      return res.json({ ok: true, class: { id: cls.id, name: cls.name }, alreadyMember: true });
    }

    await dbRun(
      `INSERT INTO classroom_members (id, classroom_id, student_id, joined_at) VALUES (?, ?, ?, ?)`,
      [nanoid(16), cls.id, userId, new Date().toISOString()]
    );
    return res.status(201).json({ ok: true, class: { id: cls.id, name: cls.name }, alreadyMember: false });
  } catch (err) {
    console.error("[quizall] classroom join error:", err);
    return res.status(500).json({ ok: false, error: "Failed to join class" });
  }
});

// ────────────────────────────────────────────────────────────────
// Assignments
// ────────────────────────────────────────────────────────────────

classroomRouter.get("/classes/:id/assignments", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const classId = req.params.id;

    const cls = await dbGet(`SELECT id, teacher_id, name FROM classrooms WHERE id = ?`, [classId]);
    if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });

    const isTeacher = cls.teacher_id === userId;
    const member = isTeacher
      ? true
      : await dbGet(`SELECT id FROM classroom_members WHERE classroom_id = ? AND student_id = ?`, [classId, userId]);
    if (!member) return res.status(403).json({ ok: false, error: "You are not in this class" });

    const rows = await dbAll(
      `SELECT id, title, exam_topics, num_questions, due_at, created_at
       FROM classroom_assignments
       WHERE classroom_id = ?
       ORDER BY created_at DESC`,
      [classId]
    );

    // For students, include their submission status
    const submissions = await dbAll(
      `SELECT assignment_id, score, total, submitted_at FROM assignment_submissions
       WHERE classroom_id = ? AND student_id = ?`,
      [classId, userId]
    );
    const subByAssignment = new Map(submissions.map((s) => [s.assignment_id, s]));

    return res.json({
      ok: true,
      className: cls.name,
      isTeacher,
      assignments: rows.map((a) => {
        const sub = subByAssignment.get(a.id);
        return {
          id: a.id,
          title: a.title,
          examTopics: a.exam_topics,
          numQuestions: Number(a.num_questions) || 10,
          dueAt: a.due_at,
          createdAt: a.created_at,
          submission: sub
            ? { score: sub.score, total: sub.total, accuracy: accuracyPercent(sub.score, sub.total), submittedAt: sub.submitted_at }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error("[quizall] classroom assignments list error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load assignments" });
  }
});

classroomRouter.get("/assignments/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const assignmentId = req.params.id;

    const a = await dbGet(
      `SELECT id, classroom_id, teacher_id, title, content, exam_topics, num_questions, due_at
       FROM classroom_assignments WHERE id = ?`,
      [assignmentId]
    );
    if (!a) return res.status(404).json({ ok: false, error: "Assignment not found" });

    const isTeacher = a.teacher_id === userId;
    const member = isTeacher
      ? true
      : await dbGet(`SELECT id FROM classroom_members WHERE classroom_id = ? AND student_id = ?`, [a.classroom_id, userId]);
    if (!member) return res.status(403).json({ ok: false, error: "You are not in this class" });

    return res.json({
      ok: true,
      assignment: {
        id: a.id,
        classroomId: a.classroom_id,
        title: a.title,
        content: a.content,
        examTopics: a.exam_topics,
        numQuestions: Number(a.num_questions) || 10,
        dueAt: a.due_at,
      },
    });
  } catch (err) {
    console.error("[quizall] classroom assignment detail error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load assignment" });
  }
});

classroomRouter.post("/classes/:id/assignments", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const classId = req.params.id;

    const cls = await dbGet(`SELECT id, teacher_id FROM classrooms WHERE id = ?`, [classId]);
    if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
    if (cls.teacher_id !== userId) return res.status(403).json({ ok: false, error: "Only the teacher can add assignments" });

    const title = normalizeWhitespace(req.body?.title || "");
    const content = String(req.body?.content || "").trim();
    const examTopics = normalizeWhitespace(req.body?.examTopics || "");
    let numQuestions = Number.parseInt(req.body?.numQuestions, 10);
    if (!Number.isInteger(numQuestions) || numQuestions < 5 || numQuestions > 20) numQuestions = 10;
    const dueAt = normalizeWhitespace(req.body?.dueAt || "") || null;

    if (title.length < 2 || title.length > 120) {
      return res.status(400).json({ ok: false, error: "Assignment title must be 2-120 characters" });
    }
    if (content.length < 30) {
      return res.status(400).json({ ok: false, error: "Please provide at least 30 characters of study material" });
    }

    const id = nanoid(16);
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO classroom_assignments (id, classroom_id, teacher_id, title, content, exam_topics, num_questions, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, classId, userId, title, content.slice(0, 120000), examTopics || null, numQuestions, dueAt, now]
    );
    await dbRun(`UPDATE classrooms SET updated_at = ? WHERE id = ?`, [now, classId]);

    return res.status(201).json({
      ok: true,
      assignment: { id, title, examTopics: examTopics || null, numQuestions, dueAt, createdAt: now, submission: null },
    });
  } catch (err) {
    console.error("[quizall] classroom assignment create error:", err);
    return res.status(500).json({ ok: false, error: "Failed to create assignment" });
  }
});

classroomRouter.post("/assignments/:id/submit", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const assignmentId = req.params.id;

    const a = await dbGet(
      `SELECT id, classroom_id, teacher_id FROM classroom_assignments WHERE id = ?`,
      [assignmentId]
    );
    if (!a) return res.status(404).json({ ok: false, error: "Assignment not found" });
    if (a.teacher_id === userId) {
      return res.status(400).json({ ok: false, error: "Teachers don't submit their own assignments" });
    }

    const member = await dbGet(
      `SELECT id FROM classroom_members WHERE classroom_id = ? AND student_id = ?`,
      [a.classroom_id, userId]
    );
    if (!member) return res.status(403).json({ ok: false, error: "You are not in this class" });

    const total = Number.parseInt(req.body?.total, 10);
    const score = Number.parseInt(req.body?.score, 10);
    if (!Number.isInteger(total) || total < 1 || total > 200) {
      return res.status(400).json({ ok: false, error: "A valid total (1–200) is required" });
    }
    if (!Number.isInteger(score) || score < 0 || score > total) {
      return res.status(400).json({ ok: false, error: "Score must be between 0 and total" });
    }

    const now = new Date().toISOString();
    const existing = await dbGet(
      `SELECT id, score, total FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`,
      [assignmentId, userId]
    );

    if (existing) {
      // Keep the best score
      const keepBest = accuracyPercent(score, total) >= accuracyPercent(existing.score, existing.total);
      if (keepBest) {
        await dbRun(
          `UPDATE assignment_submissions SET score = ?, total = ?, submitted_at = ? WHERE id = ?`,
          [score, total, now, existing.id]
        );
      }
      return res.json({ ok: true, updated: keepBest, accuracy: accuracyPercent(score, total) });
    }

    await dbRun(
      `INSERT INTO assignment_submissions (id, assignment_id, classroom_id, student_id, score, total, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nanoid(16), assignmentId, a.classroom_id, userId, score, total, now]
    );
    return res.status(201).json({ ok: true, updated: true, accuracy: accuracyPercent(score, total) });
  } catch (err) {
    console.error("[quizall] classroom submit error:", err);
    return res.status(500).json({ ok: false, error: "Failed to submit assignment" });
  }
});

// ────────────────────────────────────────────────────────────────
// Mastery report (teacher only)
// ────────────────────────────────────────────────────────────────

classroomRouter.get("/classes/:id/report", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const classId = req.params.id;

    const cls = await dbGet(`SELECT id, teacher_id, name FROM classrooms WHERE id = ?`, [classId]);
    if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
    if (cls.teacher_id !== userId) return res.status(403).json({ ok: false, error: "Only the teacher can view reports" });

    const members = await dbAll(
      `SELECT m.student_id, u.email, m.joined_at
       FROM classroom_members m
       LEFT JOIN users u ON u.id = m.student_id
       WHERE m.classroom_id = ?
       ORDER BY m.joined_at ASC`,
      [classId]
    );

    const assignments = await dbAll(
      `SELECT id, title, num_questions FROM classroom_assignments WHERE classroom_id = ? ORDER BY created_at ASC`,
      [classId]
    );

    const submissions = await dbAll(
      `SELECT assignment_id, student_id, score, total FROM assignment_submissions WHERE classroom_id = ?`,
      [classId]
    );

    const subMap = new Map();
    for (const s of submissions) {
      subMap.set(`${s.student_id}:${s.assignment_id}`, s);
    }

    const assignmentCount = assignments.length;

    const students = members.map((m) => {
      const perAssignment = assignments.map((a) => {
        const sub = subMap.get(`${m.student_id}:${a.id}`);
        return {
          assignmentId: a.id,
          title: a.title,
          accuracy: sub ? accuracyPercent(sub.score, sub.total) : null,
          score: sub ? sub.score : null,
          total: sub ? sub.total : null,
        };
      });
      const completed = perAssignment.filter((p) => p.accuracy != null);
      const avgAccuracy = completed.length
        ? Math.round(completed.reduce((sum, p) => sum + p.accuracy, 0) / completed.length)
        : null;
      // Mask email for privacy in UI (teacher still sees enough to identify)
      const email = m.email || "student";
      return {
        studentId: m.student_id,
        email,
        joinedAt: m.joined_at,
        completedCount: completed.length,
        assignmentCount,
        completionPercent: assignmentCount ? Math.round((completed.length / assignmentCount) * 100) : 0,
        avgAccuracy,
        perAssignment,
      };
    });

    return res.json({
      ok: true,
      className: cls.name,
      assignments: assignments.map((a) => ({ id: a.id, title: a.title, numQuestions: Number(a.num_questions) || 10 })),
      students,
    });
  } catch (err) {
    console.error("[quizall] classroom report error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load report" });
  }
});
