#!/usr/bin/env node

/**
 * Create Flow Smoke Test
 *
 * Validates the new create flow backend endpoints end-to-end.
 * Requires backend server running locally.
 *
 * Usage:
 *   node scripts/create_flow_smoketest.js
 *   CREATE_FLOW_BASE_URL=http://localhost:3000 node scripts/create_flow_smoketest.js
 */

const ENV_BASE_URL = process.env.CREATE_FLOW_BASE_URL || "";
let BASE_URL = ENV_BASE_URL || "http://localhost:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function api(path, { method = "GET", token = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // no-op
  }

  if (!response.ok || data.ok === false) {
    throw new Error(`${method} ${path} failed (${response.status}): ${data.error || "unknown error"}`);
  }

  return data;
}

async function resolveBaseUrl() {
  if (ENV_BASE_URL) return ENV_BASE_URL;
  const candidates = ["http://localhost:3000", "http://localhost:8080"];
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/api/health`);
      if (!response.ok) continue;
      const data = await response.json().catch(() => ({}));
      if (data && (data.ok === true || data.status === "healthy")) {
        return candidate;
      }
    } catch {
      // Try next candidate.
    }
  }
  return candidates[0];
}

async function run() {
  BASE_URL = await resolveBaseUrl();
  console.log(`[create-flow-smoke] Base URL: ${BASE_URL}`);

  const stamp = Date.now();
  const email = `createflow.${stamp}@example.com`;
  const password = "CreateFlow123!";

  console.log("[1/8] Register test user...");
  const register = await api("/api/auth/register", {
    method: "POST",
    body: { email, password },
  });
  assert(register.token, "Missing auth token after register");
  const token = register.token;

  console.log("[2/8] Create project...");
  const created = await api("/api/quiz/projects", {
    method: "POST",
    token,
    body: {
      name: `Create Flow Project ${stamp}`,
      examName: "Exam 2",
      description: "Smoke test project",
    },
  });
  assert(created.project && created.project.id, "Project creation did not return id");
  const projectId = created.project.id;

  console.log("[3/8] Upload text material...");
  const tinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n4m8AAAAASUVORK5CYII=";
  const upload = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/files`, {
    method: "POST",
    token,
    body: {
      files: [
        {
          name: "bio-review.txt",
          mimeType: "text/plain",
          text: [
            "Exam 2 includes glycolysis regulation and ATP synthesis.",
            "Focus on oxidative phosphorylation and electron transport chain.",
            "Include enzyme checkpoints and pathway control examples.",
          ].join("\n"),
        },
        {
          name: "lecture-slide.png",
          mimeType: "image/png",
          imageBase64: tinyPngBase64,
        },
      ],
    },
  });
  assert(Array.isArray(upload.files) && upload.files.length >= 2, "Upload did not persist both text and image assets");

  console.log("[4/8] Generate candidate topics...");
  const candidates = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/topics/candidates`, {
    method: "POST",
    token,
    body: { hintText: "Exam 2 glycolysis ATP" },
  });
  assert(Array.isArray(candidates.candidates), "Candidates response missing candidates array");

  const currentTopics = candidates.candidates.slice(0, 3).map((item) => item.label).filter(Boolean);
  if (!currentTopics.length) {
    currentTopics.push("Glycolysis regulation", "ATP synthesis");
  }

  console.log("[5/8] Apply chat refinement...");
  const refined = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/topics/refine`, {
    method: "POST",
    token,
    body: {
      currentTopics,
      userMessage: "Keep glycolysis and ATP synthesis, add oxidative phosphorylation, remove unrelated basics.",
    },
  });
  assert(Array.isArray(refined.updatedTopics) && refined.updatedTopics.length > 0, "Refine returned no updated topics");

  console.log("[6/8] Apply manual topics...");
  const manualTopics = Array.from(new Set([...refined.updatedTopics, "Electron transport chain"]))
    .slice(0, 8);
  const manual = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/topics/manual`, {
    method: "POST",
    token,
    body: {
      topics: manualTopics,
      strategy: "replace",
    },
  });
  assert(Array.isArray(manual.finalTopics) && manual.finalTopics.length > 0, "Manual topics returned empty finalTopics");

  console.log("[7/8] Generate artifact from confirmed topics...");
  const artifact = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/artifact/generate`, {
    method: "POST",
    token,
    body: {
      finalTopics: manual.finalTopics,
    },
  });
  assert(artifact.mindmap && Array.isArray(artifact.mindmap.nodes), "Artifact response missing mindmap");
  assert(artifact.artifact && typeof artifact.artifact.content === "string", "Artifact response missing markdown content");

  console.log("[8/8] Verify project detail includes exam prep...");
  const detail = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, {
    method: "GET",
    token,
  });
  assert(detail.examPrep && detail.examPrep.mindmap, "Project detail missing saved exam prep mindmap");

  console.log("[create-flow-smoke] ✅ PASS");
}

run().catch((err) => {
  console.error("[create-flow-smoke] ❌ FAIL", err.message || err);
  process.exit(1);
});
