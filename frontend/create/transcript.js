(function () {
  "use strict";

  let saveTimer = null;
  let pending = null;

  function serializeMessages(chatInner) {
    if (!chatInner) return [];
    return Array.from(chatInner.querySelectorAll(".msg")).map((el) => ({
      role: el.classList.contains("user") ? "user" : "ai",
      html: el.querySelector(".msg-bubble")?.innerHTML || "",
      ts: Number(el.dataset.ts) || Date.now(),
      type: el.dataset.msgType || "message",
    }));
  }

  function scheduleTranscriptSave(apiFn, projectId, chatInner, trainingState, delayMs = 800) {
    if (!projectId || !apiFn) return;
    pending = { apiFn, projectId, chatInner, trainingState };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const payload = pending;
      pending = null;
      if (!payload?.projectId) return;
      try {
        const messages = serializeMessages(payload.chatInner);
        await payload.apiFn(`/api/quiz/projects/${encodeURIComponent(payload.projectId)}/transcript`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            trainingState: payload.trainingState || null,
          }),
        });
      } catch (err) {
        console.warn("[transcript] save failed:", err.message);
      }
    }, delayMs);
  }

  async function loadTranscript(apiFn, projectId) {
    if (!projectId) return null;
    try {
      return await apiFn(`/api/quiz/projects/${encodeURIComponent(projectId)}/transcript`);
    } catch {
      return null;
    }
  }

  window.QuizAllTranscript = {
    serializeMessages,
    scheduleTranscriptSave,
    loadTranscript,
  };
})();
