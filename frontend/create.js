(function () {
  "use strict";

  const API_BASE = window.authGuard?.API_BASE || window.QUIZALL_API_BASE || "http://localhost:8080";
  const ROUNDS = [
    { key: "mcq", label: "Round 1 · Multiple Choice", short: "Round 1", types: ["multiple_choice"], numQuestions: 5 },
    { key: "fib", label: "Round 2 · Fill in the Blank", short: "Round 2", types: ["fill_in_the_blank"], numQuestions: 5 },
    { key: "frq", label: "Round 3 · Short Answer", short: "Round 3", types: ["free_response"], numQuestions: 3 },
  ];

  const state = {
    projectId: null,
    projectName: "",
    analysis: null,
    studyPlan: null,
    pendingFiles: [],
    roundIndex: -1,
    roundResults: [],
    isProcessing: false,
    viewOnly: false,
    materialPreview: "",
  };

  const els = {
    sidebar: document.getElementById("sidebar"),
    mobileMenuBtn: document.getElementById("mobileMenuBtn"),
    newChatBtn: document.getElementById("newChatBtn"),
    projectList: document.getElementById("projectList"),
    avatarBtn: document.getElementById("avatarBtn"),
    avatarInitials: document.getElementById("avatarInitials"),
    avatarEmail: document.getElementById("avatarEmail"),
    chatMain: document.getElementById("chatMain"),
    chatMessages: document.getElementById("chatMessages"),
    chatInner: document.getElementById("chatInner"),
    composerInput: document.getElementById("composerInput"),
    attachBtn: document.getElementById("attachBtn"),
    sendBtn: document.getElementById("sendBtn"),
    fileInput: null,
    attachmentsBar: document.getElementById("attachmentsBar"),
    avatarMenu: document.getElementById("avatarMenu"),
    embedOverlay: document.getElementById("embedOverlay"),
    embedTitle: document.getElementById("embedTitle"),
    embedFrame: document.getElementById("embedFrame"),
    embedClose: document.getElementById("embedClose"),
  };

  function icon(id, extraClass) {
    return `<svg class="icon${extraClass ? " " + extraClass : ""}"><use href="#${id}"></use></svg>`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
  }

  function decodeJwtEmail(token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.email || payload.sub || "User";
    } catch {
      return "User";
    }
  }

  function initialsFromEmail(email) {
    const part = String(email || "U").split("@")[0] || "U";
    return part.slice(0, 2).toUpperCase();
  }

  async function api(path, options) {
    const res = await window.authGuard.fetchWithAuth(`${API_BASE}${path}`, options || {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    });
  }

  function setConversationActive(active) {
    els.chatMain.classList.toggle("has-messages", !!active);
  }

  function setProcessing(on) {
    state.isProcessing = !!on;
    els.sendBtn.disabled = on || state.viewOnly;
    els.attachBtn.disabled = on || state.viewOnly;
    els.composerInput.disabled = on || state.viewOnly;
  }

  function setViewOnly(on) {
    state.viewOnly = !!on;
    els.sendBtn.disabled = on || state.isProcessing;
    els.attachBtn.disabled = on || state.isProcessing;
    els.composerInput.disabled = on || state.isProcessing;
  }

  function appendMessage(role, html) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    const avatar =
      role === "ai"
        ? `<div class="msg-avatar">${icon("i-sparkles")}</div>`
        : `<div class="msg-avatar">You</div>`;
    wrap.innerHTML = `${avatar}<div class="msg-bubble">${html}</div>`;
    els.chatInner.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function appendTyping() {
    const wrap = document.createElement("div");
    wrap.className = "msg ai";
    wrap.innerHTML =
      `<div class="msg-avatar">${icon("i-sparkles")}</div>` +
      '<div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    els.chatInner.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function removeTyping(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function renderWelcome() {
    els.chatInner.innerHTML = "";
    setConversationActive(false);
  }

  function formatStudyPlanHtml(plan, options) {
    const opts = options || {};
    const steps = (plan.plan || [])
      .map(
        (step, i) =>
          `<li><span class="step-title">${i + 1}. ${escapeHtml(step.title)}</span>` +
          `<span class="step-why">${escapeHtml(step.why || "")}</span>` +
          (step.estimated_minutes ? ` <span class="step-min">~${step.estimated_minutes} min</span>` : "") +
          `</li>`
      )
      .join("");
    const topics = (plan.topics || [])
      .slice(0, 8)
      .map((t) => `<span class="topic-tag">${escapeHtml(t)}</span>`)
      .join("");
    return (
      `<h3>Your study plan</h3>` +
      `<p class="meta-line">Subject: <strong>${escapeHtml(plan.subject || "General")}</strong></p>` +
      `<p>${escapeHtml(plan.summary || "Here is a simple plan based on your material.")}</p>` +
      (topics ? `<div class="topic-tags">${topics}</div>` : "") +
      (steps ? `<ul class="plan-steps">${steps}</ul>` : "") +
      (opts.includeNextStep === false ? "" : `<p class="meta-line" style="margin-top:14px;">Starting <strong>Round 1</strong>…</p>`)
    );
  }

  function formatNoteHtml(note) {
    const list = (items) => (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return (
      `<h3>Your study note</h3>` +
      `<p>${escapeHtml(note.summary || "")}</p>` +
      `<div class="note-section-label">What you know</div><ul class="note-list">${list(note.what_you_know)}</ul>` +
      `<div class="note-section-label">What to review</div><ul class="note-list">${list(note.what_to_review)}</ul>` +
      `<div class="note-section-label">Key takeaways</div><ul class="note-list">${list(note.key_takeaways)}</ul>`
    );
  }

  function normalizeType(type) {
    const raw = String(type || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (raw === "mcq") return "multiple_choice";
    if (raw === "fib" || raw === "fill_in_blank") return "fill_in_the_blank";
    if (raw === "frq" || raw === "short_answer") return "free_response";
    return raw || "multiple_choice";
  }

  function normalizeQuestion(q) {
    const type = normalizeType(q.type);
    let options = null;
    if (type === "multiple_choice") {
      options = (Array.isArray(q.options) ? q.options : []).map(String);
      if (options.length < 2) options = ["Option A", "Option B", "Option C", "Option D"];
    }
    let correct = q.correct_answer ?? q.correctAnswer ?? "";
    if (type === "multiple_choice") {
      const n = Number.parseInt(String(correct), 10);
      correct = Number.isInteger(n) ? n : 0;
    } else {
      correct = String(correct || "").trim();
    }
    return {
      type,
      question: String(q.question || q.text || "Question"),
      options,
      correct_answer: correct,
      explanation: String(q.explanation || ""),
    };
  }

  function buildAnswerHtml(question, index) {
    if (question.type === "multiple_choice") {
      return question.options
        .map((opt, oi) => {
          const label = String.fromCharCode(65 + oi);
          return `<button type="button" class="option-btn" data-q="${index}" data-o="${oi}"><span class="opt-key">${label}</span><span>${escapeHtml(opt)}</span></button>`;
        })
        .join("");
    }
    if (question.type === "fill_in_the_blank") {
      return `<input class="fill-input" data-q="${index}" placeholder="Type your answer" />`;
    }
    return `<textarea class="free-input" data-q="${index}" placeholder="Write your answer in simple words"></textarea>`;
  }

  function renderQuizCard(roundConfig, questions, onSubmit) {
    const cardId = `quiz-${Date.now()}`;
    const questionsHtml = questions
      .map((rawQ, i) => {
        const nq = normalizeQuestion(rawQ);
        return (
          `<div class="quiz-question" data-qi="${i}">` +
          `<div class="q-label">Q${i + 1}</div>` +
          `<p class="q-text">${escapeHtml(nq.question)}</p>` +
          `<div class="answers">${buildAnswerHtml(nq, i)}</div>` +
          `</div>`
        );
      })
      .join("");

    const html =
      `<h3>${escapeHtml(roundConfig.label)}</h3>` +
      `<p class="meta-line">Answer every question, then submit.</p>` +
      `<div class="quiz-card" id="${cardId}">` +
      `<div class="quiz-card-head">${icon("i-sparkles")} ${questions.length} questions</div>` +
      questionsHtml +
      `<button type="button" class="btn-round" data-submit="${cardId}">Submit round ${icon("i-arrow-right")}</button>` +
      `</div>`;

    const msg = appendMessage("ai", html);
    const card = msg.querySelector(`#${cardId}`);
    const answers = {};

    card.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-q");
        card.querySelectorAll(`.option-btn[data-q="${qi}"]`).forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[qi] = Number(btn.getAttribute("data-o"));
      });
    });

    const submitBtn = card.querySelector(`[data-submit="${cardId}"]`);
    submitBtn.addEventListener("click", () => {
      questions.forEach((_, i) => {
        if (answers[i] != null) return;
        const fill = card.querySelector(`.fill-input[data-q="${i}"]`);
        const free = card.querySelector(`.free-input[data-q="${i}"]`);
        if (fill) answers[i] = fill.value;
        if (free) answers[i] = free.value;
      });
      const missing = questions.findIndex((_, i) => answers[i] == null || String(answers[i]).trim() === "");
      if (missing >= 0) {
        submitBtn.textContent = `Answer Q${missing + 1} first`;
        setTimeout(() => {
          submitBtn.innerHTML = `Submit round ${icon("i-arrow-right")}`;
        }, 1600);
        return;
      }
      submitBtn.disabled = true;
      card.querySelectorAll(".option-btn, .fill-input, .free-input").forEach((el) => {
        el.style.pointerEvents = "none";
      });
      onSubmit(answers);
    });
  }

  function evaluateAnswer(question, userAnswer) {
    if (question.type === "multiple_choice") {
      return Number(userAnswer) === Number(question.correct_answer);
    }
    const user = String(userAnswer || "").trim().toLowerCase();
    const expected = String(question.correct_answer || "").trim().toLowerCase();
    if (!user || !expected) return false;
    if (question.type === "free_response") {
      const tokens = expected.split(/\s+/).filter((t) => t.length >= 4);
      if (!tokens.length) return user === expected;
      const hits = tokens.filter((t) => user.includes(t)).length;
      return hits >= Math.max(1, Math.ceil(tokens.length * 0.5));
    }
    return user === expected;
  }

  function displayAnswer(question, val) {
    if (question.type === "multiple_choice") {
      const i = Number(val);
      if (Array.isArray(question.options) && question.options[i] != null) {
        return `${String.fromCharCode(65 + i)}. ${question.options[i]}`;
      }
      return "(no answer)";
    }
    const s = String(val ?? "").trim();
    return s || "(no answer)";
  }

  function renderRoundReview(roundConfig, results, correct, total, isLast, onProceed) {
    const items = results
      .map((r) => {
        const cls = r.isCorrect ? "correct" : "wrong";
        const badge = r.isCorrect
          ? `<span class="review-badge correct">${icon("i-check")} Correct</span>`
          : `<span class="review-badge wrong">${icon("i-x")} Missed</span>`;
        const yourRow = `<div class="review-row"><span class="k">Your answer</span><span class="v ${r.isCorrect ? "good" : "bad"}">${escapeHtml(displayAnswer(r, r.userAnswer))}</span></div>`;
        const correctRow = r.isCorrect
          ? ""
          : `<div class="review-row"><span class="k">Correct answer</span><span class="v good">${escapeHtml(displayAnswer(r, r.correct_answer))}</span></div>`;
        const explain = r.explanation
          ? `<div class="review-explain">${escapeHtml(r.explanation)}</div>`
          : "";
        return (
          `<div class="review-item ${cls}">` +
          `<div class="review-head">${badge}<span class="review-q">${escapeHtml(r.question)}</span></div>` +
          yourRow +
          correctRow +
          explain +
          `</div>`
        );
      })
      .join("");

    const proceedLabel = isLast
      ? `Write my note ${icon("i-arrow-right")}`
      : `Start ${escapeHtml(ROUNDS[state.roundIndex + 1].short)} ${icon("i-arrow-right")}`;

    const html =
      `<h3>${escapeHtml(roundConfig.short)} results</h3>` +
      `<div class="review-score"><span class="num">${correct}/${total}</span><span class="lbl">correct</span></div>` +
      `<div class="review-list">${items}</div>` +
      `<button type="button" class="btn-round" id="proceedBtn">${proceedLabel}</button>`;

    const msg = appendMessage("ai", html);
    const btn = msg.querySelector("#proceedBtn");
    btn.addEventListener("click", () => {
      btn.disabled = true;
      onProceed();
    });
  }

  async function loadProjects() {
    try {
      const data = await api("/api/quiz/projects?limit=50");
      const projects = data.projects || [];
      if (!projects.length) {
        els.projectList.innerHTML =
          '<div class="project-list-label">History</div>' +
          '<div class="project-empty">No sessions yet. Start one below.</div>';
        return;
      }
      els.projectList.innerHTML =
        '<div class="project-list-label">History</div>' +
        projects
          .map(
            (p) =>
              `<button type="button" class="project-item${p.id === state.projectId ? " is-active" : ""}" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`
          )
          .join("");
      els.projectList.querySelectorAll(".project-item").forEach((btn) => {
        btn.addEventListener("click", () => openProject(btn.getAttribute("data-id")));
      });
    } catch (err) {
      console.error(err);
    }
  }

  function autoProjectName() {
    const d = new Date();
    return `Study · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }

  async function createProject(name) {
    const data = await api("/api/quiz/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return data.project;
  }

  let pdfLibPromise = null;
  function loadPdfJs() {
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return pdfLibPromise;
  }

  let mammothPromise = null;
  function loadMammoth() {
    if (mammothPromise) return mammothPromise;
    mammothPromise = new Promise((resolve, reject) => {
      if (window.mammoth) return resolve(window.mammoth);
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      script.onload = () => resolve(window.mammoth);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return mammothPromise;
  }

  async function extractText(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (["txt", "md", "csv", "json"].includes(ext)) return file.text();
    if (ext === "docx") {
      const mammoth = await loadMammoth();
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value || "";
    }
    if (ext === "pdf") {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item) => item.str).join(" ") + "\n";
      }
      return text;
    }
    return file.text();
  }

  async function uploadFilesToProject(projectId, files) {
    const payload = [];
    for (const file of files) {
      const text = await extractText(file);
      if (text && text.trim().length >= 20) {
        payload.push({ name: file.name, mimeType: file.type || "application/octet-stream", text });
      }
    }
    if (!payload.length) return [];
    const data = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: payload }),
    });
    return data.files || [];
  }

  function renderAttachmentsBar() {
    if (!state.pendingFiles.length) {
      els.attachmentsBar.innerHTML = "";
      return;
    }
    els.attachmentsBar.innerHTML = state.pendingFiles
      .map((f) => `<span class="attachment-chip">${icon("i-paperclip")} ${escapeHtml(f.name)}</span>`)
      .join("");
  }

  async function runStudyPlan(projectId, contentHint) {
    const typing = appendTyping();
    try {
      const data = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/study-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentHint || undefined }),
      });
      removeTyping(typing);
      state.studyPlan = data.studyPlan;
      state.analysis = data.analysis;
      appendMessage("ai", formatStudyPlanHtml(data.studyPlan));
      await startRound(0);
    } catch (err) {
      removeTyping(typing);
      appendMessage("ai", `<p>Sorry, I couldn't make a study plan: ${escapeHtml(err.message)}</p>`);
      setProcessing(false);
    }
  }

  async function generateRound(roundConfig) {
    const data = await api("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: state.projectId,
        types: roundConfig.types,
        numQuestions: roundConfig.numQuestions,
        analysis: state.analysis,
        content: state.materialPreview || undefined,
      }),
    });
    return data.quiz || [];
  }

  async function saveRoundHistory(roundConfig, rawQuestions, answers) {
    let correct = 0;
    const results = rawQuestions.map((rawQ, i) => {
      const q = normalizeQuestion(rawQ);
      const isCorrect = evaluateAnswer(q, answers[i]);
      if (isCorrect) correct += 1;
      return {
        type: q.type,
        question: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        userAnswer: answers[i],
        isCorrect,
        explanation: q.explanation,
      };
    });

    const missed = results
      .filter((r) => !r.isCorrect)
      .map((r) => ({
        question: r.question,
        userAnswer: displayAnswer(r, r.userAnswer),
        correctAnswer: displayAnswer(r, r.correct_answer),
      }));

    state.roundResults.push({
      label: roundConfig.label,
      correct,
      total: results.length,
      missed,
    });

    try {
      await api("/api/quiz/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: state.projectId,
          subject: state.studyPlan?.subject || state.projectName,
          topics: state.studyPlan?.topics || [],
          correct,
          total: results.length,
          roundLabel: roundConfig.label,
          questions: results,
        }),
      });
    } catch (err) {
      console.error("save history failed", err);
    }

    return { correct, total: results.length, results };
  }

  async function startRound(index) {
    if (index >= ROUNDS.length) {
      await finishAllRounds();
      return;
    }

    const roundConfig = ROUNDS[index];
    state.roundIndex = index;
    const typing = appendTyping();

    try {
      const questions = await generateRound(roundConfig);
      removeTyping(typing);
      if (!questions.length) throw new Error("No questions generated");

      renderQuizCard(roundConfig, questions, async (answers) => {
        const { correct, total, results } = await saveRoundHistory(roundConfig, questions, answers);
        const isLast = index >= ROUNDS.length - 1;
        renderRoundReview(roundConfig, results, correct, total, isLast, async () => {
          await startRound(index + 1);
        });
      });
    } catch (err) {
      removeTyping(typing);
      appendMessage("ai", `<p>Sorry, this round failed: ${escapeHtml(err.message)}</p>`);
      setProcessing(false);
    }
  }

  async function finishAllRounds() {
    const typing = appendTyping();
    try {
      const data = await api(`/api/quiz/projects/${encodeURIComponent(state.projectId)}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyPlan: state.studyPlan,
          rounds: state.roundResults,
          content: state.materialPreview || undefined,
        }),
      });
      removeTyping(typing);
      appendMessage("ai", formatNoteHtml(data.note));
      appendMessage("ai", `<p class="meta-line">Session complete. Start a new study session anytime from the left.</p>`);
      setProcessing(false);
      await loadProjects();
    } catch (err) {
      removeTyping(typing);
      appendMessage("ai", `<p>Sorry, I couldn't write the note: ${escapeHtml(err.message)}</p>`);
      setProcessing(false);
    }
  }

  function autosizeComposer() {
    els.composerInput.style.height = "auto";
    els.composerInput.style.height = Math.min(els.composerInput.scrollHeight, 200) + "px";
  }

  async function handleSend() {
    if (state.isProcessing || state.viewOnly) return;

    const text = els.composerInput.value.trim();
    const hasFiles = state.pendingFiles.length > 0;
    if (!text && !hasFiles) return;

    setConversationActive(true);
    setProcessing(true);
    state.roundIndex = -1;
    state.roundResults = [];
    state.analysis = null;
    state.studyPlan = null;
    state.materialPreview = text;

    const userPreview = hasFiles
      ? `Uploaded ${state.pendingFiles.length} file(s)${text ? ` + pasted text` : ""}`
      : text.slice(0, 600) + (text.length > 600 ? "…" : "");
    appendMessage("user", `<p>${escapeHtml(userPreview)}</p>`);

    els.composerInput.value = "";
    autosizeComposer();
    const filesToUpload = state.pendingFiles.slice();
    state.pendingFiles = [];
    renderAttachmentsBar();

    try {
      const project = await createProject(autoProjectName());
      state.projectId = project.id;
      state.projectName = project.name;
      await loadProjects();

      if (filesToUpload.length) {
        const typing = appendTyping();
        await uploadFilesToProject(project.id, filesToUpload);
        removeTyping(typing);
      }

      await runStudyPlan(project.id, text || undefined);
    } catch (err) {
      appendMessage("ai", `<p>Something went wrong: ${escapeHtml(err.message)}</p>`);
      setProcessing(false);
    }
  }

  async function openProject(projectId) {
    if (!projectId || state.isProcessing) return;
    state.projectId = projectId;
    state.roundResults = [];
    state.analysis = null;
    state.studyPlan = null;
    setViewOnly(true);
    setConversationActive(true);

    els.chatInner.innerHTML = "";
    const typing = appendTyping();

    try {
      const detail = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`);
      state.projectName = detail.project?.name || "Study session";
      removeTyping(typing);
      appendMessage("user", `<p>Reopened: <strong>${escapeHtml(state.projectName)}</strong></p>`);

      let planLoaded = false;
      try {
        const planRes = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/study-plan`);
        if (planRes.studyPlan) {
          state.studyPlan = planRes.studyPlan;
          appendMessage("ai", formatStudyPlanHtml(planRes.studyPlan, { includeNextStep: false }));
          planLoaded = true;
        }
      } catch {
        /* no plan yet */
      }

      if (!planLoaded && detail.files?.length) {
        appendMessage("ai", `<p>This session has ${detail.files.length} uploaded file(s), but no study plan was saved.</p>`);
      }

      try {
        const noteRes = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/note`);
        if (noteRes.note) appendMessage("ai", formatNoteHtml(noteRes.note));
      } catch {
        if (planLoaded) appendMessage("ai", `<p class="meta-line">Quiz rounds weren't finished in this session.</p>`);
      }

      appendMessage("ai", `<p class="meta-line">This is a saved session (read-only). Click "New study session" to start again.</p>`);
      await loadProjects();
    } catch (err) {
      removeTyping(typing);
      appendMessage("ai", `<p>Could not load session: ${escapeHtml(err.message)}</p>`);
    }
  }

  function resetNewChat() {
    if (state.isProcessing) return;
    state.projectId = null;
    state.projectName = "";
    state.analysis = null;
    state.studyPlan = null;
    state.pendingFiles = [];
    state.roundIndex = -1;
    state.roundResults = [];
    setViewOnly(false);
    els.composerInput.value = "";
    autosizeComposer();
    renderAttachmentsBar();
    renderWelcome();
    loadProjects();
    els.composerInput.focus();
  }

  function openEmbed(title, url) {
    els.embedTitle.textContent = title;
    els.embedFrame.src = url;
    els.embedOverlay.classList.remove("hidden");
    els.avatarMenu.classList.add("hidden");
  }

  function closeEmbed() {
    els.embedOverlay.classList.add("hidden");
    els.embedFrame.src = "about:blank";
  }

  function ensureFileInput() {
    let input = document.getElementById("fileInput");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "fileInput";
      input.multiple = true;
      input.accept = ".pdf,.docx,.txt,.md,.csv,.json";
      input.hidden = true;
      document.body.appendChild(input);
    }
    els.fileInput = input;
    return input;
  }

  function bindEvents() {
    els.newChatBtn.addEventListener("click", resetNewChat);
    els.sendBtn.addEventListener("click", handleSend);
    els.composerInput.addEventListener("input", autosizeComposer);
    els.composerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    const fileInput = ensureFileInput();
    els.attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const files = Array.from(fileInput.files || []);
      state.pendingFiles = state.pendingFiles.concat(files);
      fileInput.value = "";
      renderAttachmentsBar();
      els.composerInput.focus();
    });

    els.avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.avatarMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", () => els.avatarMenu.classList.add("hidden"));
    els.avatarMenu.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("menuSettings").addEventListener("click", () => openEmbed("Settings", "settings.html"));
    document.getElementById("menuUsage").addEventListener("click", () => openEmbed("Usage", "settings.html#accountPanel"));
    document.getElementById("menuBilling").addEventListener("click", () => openEmbed("Billing", "subscription.html"));
    document.getElementById("menuPrivacy").addEventListener("click", () => openEmbed("Privacy", "privacy.html"));
    document.getElementById("menuLogout").addEventListener("click", () => {
      window.authGuard.clearToken();
      window.location.href = "index.html";
    });

    els.embedClose.addEventListener("click", closeEmbed);
    els.embedOverlay.addEventListener("click", (e) => {
      if (e.target === els.embedOverlay) closeEmbed();
    });

    if (els.mobileMenuBtn) {
      els.mobileMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        els.sidebar.classList.toggle("open");
      });
    }
  }

  function initAuth() {
    if (!window.authGuard?.requireLogin({ redirectTo: "index.html" })) return false;
    const token = window.authGuard.getToken();
    const email = decodeJwtEmail(token);
    els.avatarInitials.textContent = initialsFromEmail(email);
    els.avatarEmail.textContent = email;
    return true;
  }

  function init() {
    if (!initAuth()) return;
    bindEvents();
    renderWelcome();
    loadProjects();
    autosizeComposer();
    els.composerInput.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
