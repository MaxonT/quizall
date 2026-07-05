(function () {
  "use strict";

  const API_BASE = window.authGuard?.API_BASE || window.QUIZALL_API_BASE || "http://localhost:8080";
  const ROUNDS = [
    { key: "mcq", label: "Round 1: Multiple Choice", types: ["multiple_choice"], numQuestions: 5 },
    { key: "fib", label: "Round 2: Fill in the Blank", types: ["fill_in_the_blank"], numQuestions: 5 },
    { key: "frq", label: "Round 3: Short Answer (FRQ)", types: ["free_response"], numQuestions: 3 },
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
    chatMessages: document.getElementById("chatMessages"),
    chatInner: document.getElementById("chatInner"),
    composer: document.getElementById("composer"),
    composerInput: document.getElementById("composerInput"),
    attachBtn: document.getElementById("attachBtn"),
    sendBtn: document.getElementById("sendBtn"),
    fileInput: document.getElementById("fileInput"),
    attachmentsBar: document.getElementById("attachmentsBar"),
    avatarMenu: document.getElementById("avatarMenu"),
    embedOverlay: document.getElementById("embedOverlay"),
    embedTitle: document.getElementById("embedTitle"),
    embedFrame: document.getElementById("embedFrame"),
    embedClose: document.getElementById("embedClose"),
  };

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
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    });
  }

  function setProcessing(on) {
    state.isProcessing = !!on;
    els.sendBtn.disabled = on;
    els.attachBtn.disabled = on;
    els.composerInput.disabled = on || state.viewOnly;
  }

  function appendMessage(role, html, extraClass) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}${extraClass ? ` ${extraClass}` : ""}`;
    const avatarLabel = role === "ai" ? "AI" : "You";
    wrap.innerHTML =
      `<div class="msg-avatar">${avatarLabel}</div>` +
      `<div class="msg-bubble">${html}</div>`;
    els.chatInner.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function appendTyping() {
    const wrap = document.createElement("div");
    wrap.className = "msg ai typing-msg";
    wrap.innerHTML =
      '<div class="msg-avatar">AI</div>' +
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
    appendMessage(
      "ai",
      "<h3>Hi! I'm your quiz coach.</h3>" +
        "<p>Upload study material (PDF, DOCX, TXT) or paste text below.</p>" +
        "<p>I'll read it, make a <strong>simple study plan</strong>, then quiz you in <strong>three rounds</strong>: multiple choice → fill in the blank → short answer.</p>" +
        "<p>When you're done, I'll write you a short <strong>study note</strong>.</p>"
    );
  }

  function formatStudyPlanHtml(plan, options) {
    const opts = options || {};
    const steps = (plan.plan || [])
      .map((step, i) => `<li><strong>Step ${i + 1}: ${escapeHtml(step.title)}</strong><br>${escapeHtml(step.why || "")}${step.estimated_minutes ? ` <em>(~${step.estimated_minutes} min)</em>` : ""}</li>`)
      .join("");
    const topics = (plan.topics || []).slice(0, 6).map((t) => escapeHtml(t)).join(" · ");
    return (
      `<h3>Your study plan</h3>` +
      `<p><strong>Subject:</strong> ${escapeHtml(plan.subject || "General")}</p>` +
      `<p>${escapeHtml(plan.summary || "Here is a simple plan based on your material.")}</p>` +
      (topics ? `<p><strong>Key topics:</strong> ${topics}</p>` : "") +
      (steps ? `<ul class="plan-steps">${steps}</ul>` : "") +
      (opts.includeNextStep === false ? "" : `<p style="margin-top:12px;">Starting <strong>Round 1</strong> now…</p>`)
    );
  }

  function formatNoteHtml(note) {
    const list = (items) => (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return (
      `<h3>Your study note</h3>` +
      `<p>${escapeHtml(note.summary || "")}</p>` +
      `<p><strong>What you know:</strong></p><ul class="note-list">${list(note.what_you_know)}</ul>` +
      `<p><strong>What to review:</strong></p><ul class="note-list">${list(note.what_to_review)}</ul>` +
      `<p><strong>Key takeaways:</strong></p><ul class="note-list">${list(note.key_takeaways)}</ul>`
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
          return `<button type="button" class="option-btn" data-q="${index}" data-o="${oi}"><strong>${label}.</strong> ${escapeHtml(opt)}</button>`;
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
      .map((q, i) => {
        const nq = normalizeQuestion(q);
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
      `<p>Answer each question below, then submit.</p>` +
      `<div class="quiz-card" id="${cardId}">` +
      `<div class="quiz-card-head"><span>${questions.length} questions</span></div>` +
      questionsHtml +
      `<button type="button" class="btn-submit-round" data-submit="${cardId}">Submit round</button>` +
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

    card.querySelector(`[data-submit="${cardId}"]`).addEventListener("click", () => {
      questions.forEach((_, i) => {
        if (answers[i] != null) return;
        const fill = card.querySelector(`.fill-input[data-q="${i}"]`);
        const free = card.querySelector(`.free-input[data-q="${i}"]`);
        if (fill) answers[i] = fill.value;
        if (free) answers[i] = free.value;
      });
      const missing = questions.findIndex((_, i) => answers[i] == null || answers[i] === "");
      if (missing >= 0) {
        alert(`Please answer question ${missing + 1} before submitting.`);
        return;
      }
      card.querySelector(`[data-submit="${cardId}"]`).disabled = true;
      onSubmit(answers, card);
    });

    return { msg, card, questions: questions.map(normalizeQuestion) };
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

  async function loadProjects() {
    try {
      const data = await api("/api/quiz/projects?limit=50");
      const projects = data.projects || [];
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
    els.attachmentsBar.innerHTML = state.pendingFiles.map((f) => `<span>${escapeHtml(f.name)}</span>`).join("");
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
    return (data.quiz || []).map(normalizeQuestion);
  }

  async function saveRoundHistory(roundConfig, questions, answers) {
    let correct = 0;
    const results = questions.map((q, i) => {
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
        userAnswer: r.userAnswer,
        correctAnswer: r.correct_answer,
      }));

    state.roundResults.push({
      label: roundConfig.label,
      correct,
      total: questions.length,
      missed,
      results,
    });

    await api("/api/quiz/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: state.projectId,
        subject: state.studyPlan?.subject || state.projectName,
        topics: state.studyPlan?.topics || [],
        correct,
        total: questions.length,
        roundLabel: roundConfig.label,
        questions: results,
      }),
    });

    return { correct, total: questions.length };
  }

  function startRound(index) {
    return new Promise(async (resolve) => {
      if (index >= ROUNDS.length) {
        await finishAllRounds();
        resolve();
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
          const score = await saveRoundHistory(roundConfig, questions, answers);
          appendMessage(
            "ai",
            `<p><strong>${escapeHtml(roundConfig.label)}</strong> done: ${score.correct}/${score.total} correct.</p>` +
              (index < ROUNDS.length - 1 ? `<p>Starting <strong>${escapeHtml(ROUNDS[index + 1].label)}</strong>…</p>` : `<p>All rounds done. Writing your note…</p>`)
          );
          await startRound(index + 1);
          resolve();
        });
      } catch (err) {
        removeTyping(typing);
        appendMessage("ai", `<p>Sorry, quiz failed: ${escapeHtml(err.message)}</p>`);
        setProcessing(false);
        resolve();
      }
    });
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
      setProcessing(false);
      await loadProjects();
    } catch (err) {
      removeTyping(typing);
      appendMessage("ai", `<p>Sorry, note failed: ${escapeHtml(err.message)}</p>`);
      setProcessing(false);
    }
  }

  async function handleSend() {
    if (state.isProcessing || state.viewOnly) return;

    const text = els.composerInput.value.trim();
    const hasFiles = state.pendingFiles.length > 0;
    if (!text && !hasFiles) return;

    setProcessing(true);
    state.viewOnly = false;
    state.roundIndex = -1;
    state.roundResults = [];
    state.analysis = null;
    state.studyPlan = null;
    state.materialPreview = text;

    const userPreview = hasFiles
      ? `Uploaded ${state.pendingFiles.length} file(s)${text ? ` and pasted text` : ""}`
      : text.slice(0, 500) + (text.length > 500 ? "…" : "");
    appendMessage("user", `<p>${escapeHtml(userPreview)}</p>`);

    els.composerInput.value = "";
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
    state.viewOnly = true;
    state.roundResults = [];
    state.analysis = null;
    state.studyPlan = null;
    setProcessing(false);
    els.composerInput.disabled = true;
    els.sendBtn.disabled = true;
    els.attachBtn.disabled = true;

    els.chatInner.innerHTML = "";
    const typing = appendTyping();

    try {
      const detail = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`);
      state.projectName = detail.project?.name || "Study session";
      appendMessage("user", `<p>Opened: <strong>${escapeHtml(state.projectName)}</strong></p>`);

      let planLoaded = false;
      try {
        const planRes = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/study-plan`);
        if (planRes.studyPlan) {
          state.studyPlan = planRes.studyPlan;
          state.analysis = {
            subject: planRes.studyPlan.subject,
            topics: planRes.studyPlan.topics,
            key_concepts: planRes.studyPlan.key_concepts || [],
          };
          appendMessage("ai", formatStudyPlanHtml(planRes.studyPlan, { includeNextStep: false }));
          planLoaded = true;
        }
      } catch {
        /* no plan yet */
      }

      if (!planLoaded && detail.files?.length) {
        appendMessage("ai", `<p>This session has ${detail.files.length} uploaded file(s) but no study plan saved yet.</p>`);
      }

      try {
        const noteRes = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/note`);
        if (noteRes.note) appendMessage("ai", formatNoteHtml(noteRes.note));
      } catch {
        if (planLoaded) appendMessage("ai", "<p>Quiz rounds not finished yet for this session.</p>");
      }

      removeTyping(typing);
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
    state.viewOnly = false;
    state.materialPreview = "";
    els.composerInput.disabled = false;
    els.sendBtn.disabled = false;
    els.attachBtn.disabled = false;
    els.composerInput.value = "";
    renderAttachmentsBar();
    renderWelcome();
    loadProjects();
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

  function bindEvents() {
    els.newChatBtn.addEventListener("click", resetNewChat);
    els.sendBtn.addEventListener("click", handleSend);
    els.composerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    els.attachBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", () => {
      const files = Array.from(els.fileInput.files || []);
      state.pendingFiles = state.pendingFiles.concat(files);
      els.fileInput.value = "";
      renderAttachmentsBar();
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
      els.mobileMenuBtn.addEventListener("click", () => els.sidebar.classList.toggle("open"));
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
