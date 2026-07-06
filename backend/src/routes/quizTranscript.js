import { Router } from "express";
import { requireAuth } from "./auth.js";
import { dbGet, dbRun } from "../lib/dbHelpers.js";

export const quizTranscriptRouter = Router();

function safeJsonParse(value, fallback = null) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function getProjectForUser(projectId, userId) {
  return dbGet(
    `SELECT id, name, exam_name, exam_date, description, created_at, updated_at
     FROM study_projects WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
}

quizTranscriptRouter.get("/projects/:id/transcript", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;
    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const row = await dbGet(
      `SELECT messages_json, training_state_json, updated_at FROM study_chat_transcripts WHERE project_id = ? AND user_id = ?`,
      [projectId, userId]
    );

    if (!row) {
      return res.json({ ok: true, messages: [], trainingState: null, updatedAt: null });
    }

    return res.json({
      ok: true,
      messages: safeJsonParse(row.messages_json, []),
      trainingState: row.training_state_json ? safeJsonParse(row.training_state_json, null) : null,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error("[quizall] transcript GET error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load chat transcript" });
  }
});

quizTranscriptRouter.put("/projects/:id/transcript", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;
    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const trainingState = req.body?.trainingState ?? req.body?.training_state ?? null;
    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO study_chat_transcripts (project_id, user_id, messages_json, training_state_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         messages_json = excluded.messages_json,
         training_state_json = excluded.training_state_json,
         updated_at = excluded.updated_at`,
      [
        projectId,
        userId,
        JSON.stringify(messages),
        trainingState ? JSON.stringify(trainingState) : null,
        now,
      ]
    );

    return res.json({ ok: true, updatedAt: now });
  } catch (err) {
    console.error("[quizall] transcript PUT error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save chat transcript" });
  }
});
