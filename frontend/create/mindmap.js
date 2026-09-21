(function () {
  "use strict";

  function findNode(nodeId, nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === nodeId) return { node, parentNodes: nodes, index: i };
      const found = findNode(nodeId, node.children || []);
      if (found) return found;
    }
    return null;
  }

  function collectTopicNodes(nodes, out) {
    (nodes || []).forEach((node) => {
      out.push(node);
      collectTopicNodes(node.children, out);
    });
    return out;
  }

  function pickWeakTopic(mindmap) {
    const nodes = collectTopicNodes(mindmap?.nodes || [], []);
    const weak = nodes.filter((n) => n.status === "red" || n.status === "yellow");
    if (weak.length) return weak[Math.floor(Math.random() * weak.length)].text;
    const roots = (mindmap?.nodes || []).map((n) => n.text).filter(Boolean);
    if (roots.length) return roots[Math.floor(Math.random() * roots.length)];
    return "";
  }

  function renderMindNode(node, depth, escapeHtml) {
    const wrapper = document.createElement("div");
    wrapper.className = `mind-node status-${node.status || "gray"}`;
    if (depth > 0) wrapper.style.marginLeft = `${Math.min(depth * 10, 40)}px`;

    const fullText = String(node.text || "");
    const row = document.createElement("div");
    row.className = "mind-row";
    row.innerHTML =
      `<button type="button" class="mind-topic-btn" data-topic="${escapeHtml(fullText)}" title="Practice this topic">` +
      `<span class="mind-status-dot"></span>` +
      `</button>` +
      `<div class="mind-label" contenteditable="true" data-node-id="${escapeHtml(node.id)}" title="${escapeHtml(fullText)}">${escapeHtml(fullText)}</div>` +
      `<div class="mind-actions">` +
      `<button class="mind-node-btn" type="button" data-node-action="add" data-node-id="${escapeHtml(node.id)}">+</button>` +
      `<button class="mind-node-btn" type="button" data-node-action="delete" data-node-id="${escapeHtml(node.id)}">−</button>` +
      `</div>`;
    wrapper.appendChild(row);

    if (Array.isArray(node.children) && node.children.length) {
      const childrenWrap = document.createElement("details");
      childrenWrap.className = "mind-children";
      const toggle = document.createElement("summary");
      toggle.className = "mind-children-toggle";
      const n = node.children.length;
      toggle.textContent = `${n} note${n === 1 ? "" : "s"}`;
      childrenWrap.appendChild(toggle);
      const list = document.createElement("div");
      list.className = "mind-children-list";
      node.children.forEach((child) => list.appendChild(renderMindNode(child, depth + 1, escapeHtml)));
      childrenWrap.appendChild(list);
      wrapper.appendChild(childrenWrap);
    }
    return wrapper;
  }

  function renderOutlineChips(candidates, selectedId, escapeHtml) {
    if (!candidates?.length) {
      return `<p class="meta-line">No outline file detected — we'll use your uploaded content.</p>`;
    }
    return (
      `<p class="meta-line">Detected syllabus-like files. Pick one for your exam map:</p>` +
      `<div class="outline-chips">` +
      candidates
        .map(
          (c) =>
            `<button type="button" class="outline-chip${c.id === selectedId ? " is-active" : ""}" data-file-id="${escapeHtml(c.id)}">` +
            `${escapeHtml(c.fileName)}` +
            `</button>`
        )
        .join("") +
      `</div>`
    );
  }

  /**
   * @param {HTMLElement} mount
   */
  function bindMindmapTree(mount, mindmap, handlers) {
    const { onChange, onTopicSelect, escapeHtml } = handlers;

    mount.querySelectorAll(".mind-topic-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const topic = btn.getAttribute("data-topic");
        if (topic && onTopicSelect) onTopicSelect(topic);
      });
    });

    mount.addEventListener("input", (e) => {
      const label = e.target.closest(".mind-label");
      if (!label) return;
      const nodeId = label.getAttribute("data-node-id");
      const found = findNode(nodeId, mindmap.nodes);
      if (found) {
        found.node.text = label.textContent.trim();
        onChange?.(mindmap);
      }
    });

    mount.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-node-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-node-action");
      const nodeId = btn.getAttribute("data-node-id");
      const found = findNode(nodeId, mindmap.nodes);
      if (!found) return;

      if (action === "add") {
        if (!found.node.children) found.node.children = [];
        found.node.children.push({
          id: `n-${Date.now()}`,
          text: "New topic",
          status: "gray",
          children: [],
        });
      } else if (action === "delete") {
        if (found.parentNodes.length <= 1 && found.parentNodes === mindmap.nodes) return;
        found.parentNodes.splice(found.index, 1);
        if (!mindmap.nodes.length) {
          mindmap.nodes.push({ id: `n-${Date.now()}`, text: "Core topic", status: "gray", children: [] });
        }
      }
      onChange?.(mindmap);
      rerenderTree(mount, mindmap, handlers);
    });
  }

  function rerenderTree(mount, mindmap, handlers) {
    const tree = mount.querySelector(".mindmap-tree");
    if (!tree) return;
    tree.innerHTML = "";
    (mindmap.nodes || []).forEach((node) => tree.appendChild(renderMindNode(node, 0, handlers.escapeHtml)));
    bindMindmapTree(mount, mindmap, handlers);
  }

  function createMindmapArtifact(mindmap, handlers) {
    const { escapeHtml, icon, onSave, onStartQuiz, onTopicSelect, startLabel } = handlers;
    const cardId = `mindmap-${Date.now()}`;
    const dateText = mindmap.generatedAt
      ? new Date(mindmap.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "just now";
    const quizBtnLabel = startLabel || "Start quiz";

    const wrap = document.createElement("div");
    wrap.className = "mindmap-artifact";
    wrap.id = cardId;
    wrap.innerHTML =
      `<h3>Your exam map</h3>` +
      `<p class="meta-line">${escapeHtml(mindmap.message || "Topics organized for your exam.")} · ${escapeHtml(dateText)}</p>` +
      `<div class="mindmap-tree"></div>` +
      `<div class="mindmap-actions">` +
      `<button type="button" class="btn-text mindmap-save">Save map</button>` +
      `<button type="button" class="btn-round mindmap-quiz">${escapeHtml(quizBtnLabel)} ${icon("i-arrow-right")}</button>` +
      `</div>`;

    const tree = wrap.querySelector(".mindmap-tree");
    (mindmap.nodes || []).forEach((node) => tree.appendChild(renderMindNode(node, 0, escapeHtml)));

    const h = {
      escapeHtml,
      onChange: () => {},
      onTopicSelect: (topic) => {
        if (onTopicSelect) onTopicSelect(topic);
        wrap.querySelector(".mindmap-topic-hint")?.remove();
        const hint = document.createElement("p");
        hint.className = "meta-line mindmap-topic-hint";
        hint.innerHTML = `Practicing: <strong>${escapeHtml(topic)}</strong>`;
        wrap.querySelector(".mindmap-actions")?.before(hint);
      },
    };
    bindMindmapTree(wrap, mindmap, h);

    wrap.querySelector(".mindmap-save")?.addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      try {
        await onSave(mindmap);
        e.currentTarget.textContent = "Saved";
      } catch {
        e.currentTarget.textContent = "Save failed";
        e.currentTarget.disabled = false;
      }
    });

    wrap.querySelector(".mindmap-quiz")?.addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      onStartQuiz?.();
    });

    return { element: wrap, update: (next) => rerenderTree(wrap, next, h) };
  }

  function applyMasteryToMindmap(mindmap, topicScores) {
    if (!mindmap?.nodes || !topicScores) return mindmap;
    const scores = topicScores;
    function walk(nodes) {
      (nodes || []).forEach((node) => {
        const key = String(node.text || "").toLowerCase();
        const match = Object.entries(scores).find(([t]) => String(t).toLowerCase() === key);
        if (match) {
          const acc = match[1];
          if (acc >= 80) node.status = "green";
          else if (acc >= 60) node.status = "yellow";
          else node.status = "red";
        } else if (!node.status) {
          node.status = "gray";
        }
        walk(node.children);
      });
    }
    walk(mindmap.nodes);
    return mindmap;
  }

  window.QuizAllMindmap = {
    createMindmapArtifact,
    renderOutlineChips,
    pickWeakTopic,
    collectTopicNodes,
    applyMasteryToMindmap,
  };
})();
