import { useState, useRef, useEffect, useCallback } from "react";
import * as mammoth from "mammoth";

const THEMES = {
  dark: {
    bg: "#0D0F14", surface: "#151820", card: "#1A1E2A", accent: "#4AE68A",
    accentSoft: "rgba(74,230,138,0.12)", accentGlow: "rgba(74,230,138,0.25)",
    wrong: "#FF5C72", wrongSoft: "rgba(255,92,114,0.12)",
    text: "#E8ECF4", textMuted: "#8B93A7", textDim: "#5A6178",
    border: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.1)", glowOp: 0.15,
  },
  light: {
    bg: "#F4F5F7", surface: "#FFFFFF", card: "#FFFFFF", accent: "#1B9E56",
    accentSoft: "rgba(27,158,86,0.1)", accentGlow: "rgba(27,158,86,0.18)",
    wrong: "#D93651", wrongSoft: "rgba(217,54,81,0.08)",
    text: "#1A1D26", textMuted: "#5F6777", textDim: "#9CA3B0",
    border: "rgba(0,0,0,0.07)", borderLight: "rgba(0,0,0,0.12)", glowOp: 0.06,
  },
};

function useTheme(pref) {
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const resolved = pref === "system" ? (sysDark ? "dark" : "light") : pref;
  return THEMES[resolved];
}

// Load PDF.js from CDN lazily
let pdfjsLib = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { pdfjsLib = window.pdfjsLib; return resolve(pdfjsLib); }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      pdfjsLib = window.pdfjsLib;
      resolve(pdfjsLib);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function extractText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt" || ext === "md" || ext === "csv") return await file.text();
  if (ext === "docx") {
    const ab = await file.arrayBuffer();
    return (await mammoth.extractRawText({ arrayBuffer: ab })).value;
  }
  if (ext === "pdf") {
    try {
      const lib = await loadPdfJs();
      const ab = await file.arrayBuffer();
      const pdf = await lib.getDocument({ data: ab }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
      }
      if (text.trim().length > 30) return text;
      return "[PDF had no extractable text: " + file.name + "]";
    } catch (e) {
      console.warn("PDF.js failed, falling back:", e);
      const t = await file.text();
      const r = t.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, "\n");
      return r.trim().length > 50 ? r : "[Could not extract PDF: " + file.name + "]";
    }
  }
  return await file.text();
}

async function callClaude(prompt, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content.map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n");
}

// Pass 1: Analyze content and extract key concepts
async function analyzeContent(content) {
  const prompt = "You are an expert educator. Analyze the following study material and extract the key concepts, facts, and topics that a student should be tested on.\n\nReturn ONLY a valid JSON object with this structure (no markdown, no backticks):\n{\n  \"subject\": \"the main subject area\",\n  \"topics\": [\"topic1\", \"topic2\", ...],\n  \"key_concepts\": [\n    {\"concept\": \"name\", \"detail\": \"brief explanation\", \"difficulty\": \"easy|medium|hard\"}\n  ],\n  \"sources\": [\"list of source filenames or sections detected\"]\n}\n\nCONTENT:\n" + content.slice(0, 10000) + "\n\nReturn ONLY the JSON:";
  const txt = await callClaude(prompt, 800);
  try {
    return JSON.parse(txt.replace(/```json|```/g, "").trim());
  } catch (e) {
    return null;
  }
}

// Pass 2: Generate targeted quiz based on analysis
async function generateQuiz(content, types, n = 8, onStatus) {
  if (onStatus) onStatus("Analyzing your study materials...");

  const analysis = await analyzeContent(content);
  const analysisCtx = analysis
    ? "\n\nANALYSIS OF CONTENT:\nSubject: " + analysis.subject + "\nKey topics: " + (analysis.topics || []).join(", ") + "\nKey concepts: " + (analysis.key_concepts || []).map(c => c.concept + " (" + c.difficulty + "): " + c.detail).join("; ")
    : "";

  if (onStatus) onStatus("Generating " + n + " quiz questions" + (analysis ? " across " + (analysis.topics || []).length + " topics" : "") + "...");

  const prompt = "You are an expert quiz creator who designs high-quality exam questions following Bloom\'s Taxonomy. Create questions that test different cognitive levels: Remember (recall facts), Understand (explain concepts), Apply (use knowledge in new situations), and Analyze (break down and examine).\n\nRULES:\n- Generate EXACTLY " + n + " questions\n- Use ONLY these types: " + types.join(", ") + "\n- Distribute questions evenly across all topics in the content\n- Vary cognitive difficulty: include some recall, some understanding, some application questions\n- Make wrong options plausible (avoid obviously silly answers)\n- Each explanation should teach WHY the answer is correct\n- For fill_in_the_blank, the blank should replace a KEY term, not a trivial word\n- For true_false, avoid tricky double negatives\n\nReturn ONLY a valid JSON array (no markdown, no backticks, no preamble).\n\nFormats:\nFor \"multiple_choice\": {\"type\":\"multiple_choice\",\"question\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correct\":0,\"explanation\":\"...\",\"topic\":\"...\",\"difficulty\":\"easy|medium|hard\"}\nFor \"true_false\": {\"type\":\"true_false\",\"question\":\"...\",\"correct\":true,\"explanation\":\"...\",\"topic\":\"...\",\"difficulty\":\"easy|medium|hard\"}\nFor \"fill_in_the_blank\": {\"type\":\"fill_in_the_blank\",\"question\":\"The ___ is...\",\"answer\":\"word\",\"explanation\":\"...\",\"topic\":\"...\",\"difficulty\":\"easy|medium|hard\"}" + analysisCtx + "\n\nSOURCE CONTENT:\n" + content.slice(0, 11000) + "\n\nReturn ONLY the JSON array:";

  const txt = await callClaude(prompt, 1500);
  const quiz = JSON.parse(txt.replace(/```json|```/g, "").trim());
  if (onStatus) onStatus(null);
  return { quiz, analysis };
}

const Ic = {
  Upload: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  File: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  X: ({s=14}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Zap: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  ArrowR: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Refresh: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Brain: () => <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A5.5 5.5 0 005 7.5c0 .68.12 1.33.35 1.93A5.5 5.5 0 003 14.5 5.5 5.5 0 008.5 20H12V2H9.5z"/><path d="M14.5 2A5.5 5.5 0 0120 7.5c0 .68-.12 1.33-.35 1.93A5.5 5.5 0 0122 14.5 5.5 5.5 0 0016.5 20H12V2h2.5z"/></svg>,
  Sun: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  Monitor: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
};

function ThemeSwitch({ pref, set, C }) {
  const opts = [
    { id: "light", icon: <Ic.Sun />, tip: "Light" },
    { id: "dark", icon: <Ic.Moon />, tip: "Dark" },
    { id: "system", icon: <Ic.Monitor />, tip: "System" },
  ];
  return (
    <div style={{ display: "flex", background: C.surface, borderRadius: 10, border: "1px solid " + C.border, padding: 3, gap: 2 }}>
      {opts.map(o => (
        <button key={o.id} onClick={() => set(o.id)} title={o.tip} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "6px 11px", borderRadius: 7, border: "none",
          background: pref === o.id ? C.accentSoft : "transparent",
          color: pref === o.id ? C.accent : C.textDim,
          cursor: "pointer", transition: "all 0.2s",
        }}>{o.icon}</button>
      ))}
    </div>
  );
}

function FileChip({ file, onRemove, C }) {
  const kb = (file.size / 1024).toFixed(0);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      background: C.accentSoft, borderRadius: 9, padding: "7px 10px 7px 12px",
      fontSize: 13, color: C.accent, fontWeight: 500, maxWidth: 260,
      border: "1px solid " + C.accentGlow,
    }}>
      <Ic.File />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.name}</span>
      <span style={{ fontSize: 11, color: C.textDim, flexShrink: 0 }}>{kb}KB</span>
      <button onClick={e => { e.stopPropagation(); onRemove(); }} title="Remove"
        style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 2, display: "flex", borderRadius: 4, flexShrink: 0 }}>
        <Ic.X s={12} />
      </button>
    </div>
  );
}

function DropZone({ files, onAdd, onRemove, C }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const onDrop = useCallback(e => { e.preventDefault(); setDrag(false); const f = Array.from(e.dataTransfer.files); if (f.length) onAdd(f); }, [onAdd]);

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
        onClick={() => ref.current?.click()}
        style={{
          border: drag ? "2px dashed " + C.accent : "1px dashed " + C.borderLight,
          background: drag ? C.accentSoft : C.surface, cursor: "pointer", textAlign: "center",
          padding: files.length ? "26px 24px" : "48px 28px", borderRadius: 16,
          transition: "all 0.25s", marginBottom: files.length ? 0 : 20,
          borderBottomLeftRadius: files.length ? 0 : 16, borderBottomRightRadius: files.length ? 0 : 16,
        }}>
        <input ref={ref} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.rtf" style={{ display: "none" }}
          onChange={e => { const s = Array.from(e.target.files); if (s.length) onAdd(s); e.target.value = ""; }} />
        <div style={{ color: C.accent, marginBottom: 10, display: "flex", justifyContent: "center" }}><Ic.Upload /></div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: C.text }}>
          {files.length ? "Add more files" : "Drop your study materials here"}
        </div>
        <div style={{ fontSize: 13, color: C.textMuted }}>PDF, DOCX, TXT, CSV \u2014 upload as many as you need</div>
      </div>

      {files.length > 0 && (
        <div style={{
          background: C.card, border: "1px solid " + C.border, borderTop: "none",
          borderBottomLeftRadius: 16, borderBottomRightRadius: 16, padding: "14px 18px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {files.length} file{files.length !== 1 ? "s" : ""} ready
            </span>
            <button onClick={e => { e.stopPropagation(); onRemove("all"); }}
              style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Clear all
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {files.map((f, i) => <FileChip key={f.name + "-" + f.size + "-" + i} file={f} onRemove={() => onRemove(i)} C={C} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function QHeader({ index, type, topic, difficulty, C }) {
  const diffColors = { easy: "#4AE68A", medium: "#FFD166", hard: "#FF5C72" };
  const dc = diffColors[difficulty] || C.textDim;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: C.textDim, fontWeight: 600 }}>Q{index + 1}</span>
        {topic && <span style={{ fontSize: 11, color: C.textMuted, background: C.surface, padding: "3px 8px", borderRadius: 5, fontWeight: 500 }}>{topic}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {difficulty && <span style={{ fontSize: 10, color: dc, background: dc + "18", padding: "3px 8px", borderRadius: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{difficulty}</span>}
        <span style={{ fontSize: 11, color: C.textDim, background: C.surface, padding: "4px 10px", borderRadius: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{type}</span>
      </div>
    </div>
  );
}

function Expl({ text, C }) {
  return <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: C.accentSoft, border: "1px solid " + C.accentGlow, fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{text}</div>;
}

function MCQ({ q, i, ans, onAns, done, C }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, border: "1px solid " + C.border, padding: 28, marginBottom: 20 }}>
      <QHeader index={i} type="Multiple Choice" topic={q.topic} difficulty={q.difficulty} C={C} />
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 18, lineHeight: 1.5, color: C.text }}>{q.question}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((opt, oi) => {
          const sel = ans === oi, cor = oi === q.correct;
          let bg = C.surface, bd = C.border, cl = C.text;
          if (done && cor) { bg = C.accentSoft; bd = C.accent; cl = C.accent; }
          else if (done && sel && !cor) { bg = C.wrongSoft; bd = C.wrong; cl = C.wrong; }
          else if (sel) { bg = C.accentSoft; bd = C.accent; }
          return (
            <button key={oi} onClick={() => !done && onAns(oi)} disabled={done}
              style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px solid " + bd, background: bg, color: cl, fontSize: 14, fontFamily: "inherit", textAlign: "left", cursor: done ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s", fontWeight: sel ? 600 : 400 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, background: sel ? (done && !cor ? C.wrong : C.accent) : "transparent", border: sel ? "none" : "1.5px solid " + C.textDim, color: sel ? C.bg : C.textDim }}>
                {String.fromCharCode(65 + oi)}
              </span>{opt}
            </button>
          );
        })}
      </div>
      {done && q.explanation && <Expl text={q.explanation} C={C} />}
    </div>
  );
}

function TFQ({ q, i, ans, onAns, done, C }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, border: "1px solid " + C.border, padding: 28, marginBottom: 20 }}>
      <QHeader index={i} type="True / False" topic={q.topic} difficulty={q.difficulty} C={C} />
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 18, lineHeight: 1.5, color: C.text }}>{q.question}</div>
      <div style={{ display: "flex", gap: 10 }}>
        {[true, false].map(v => {
          const sel = ans === v, cor = v === q.correct;
          let bg = C.surface, bd = C.border, cl = C.text;
          if (done && cor) { bg = C.accentSoft; bd = C.accent; cl = C.accent; }
          else if (done && sel && !cor) { bg = C.wrongSoft; bd = C.wrong; cl = C.wrong; }
          else if (sel) { bg = C.accentSoft; bd = C.accent; }
          return <button key={String(v)} onClick={() => !done && onAns(v)} disabled={done}
            style={{ flex: 1, padding: "14px 20px", borderRadius: 10, border: "1.5px solid " + bd, background: bg, color: cl, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: done ? "default" : "pointer", transition: "all 0.15s" }}>
            {v ? "True" : "False"}
          </button>;
        })}
      </div>
      {done && q.explanation && <Expl text={q.explanation} C={C} />}
    </div>
  );
}

function FIBQ({ q, i, ans, onAns, done, C }) {
  const cor = done && ans?.toLowerCase().trim() === q.answer?.toLowerCase().trim();
  return (
    <div style={{ background: C.card, borderRadius: 16, border: "1px solid " + C.border, padding: 28, marginBottom: 20 }}>
      <QHeader index={i} type="Fill in the Blank" topic={q.topic} difficulty={q.difficulty} C={C} />
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 18, lineHeight: 1.5, color: C.text }}>{q.question}</div>
      <input type="text" value={ans || ""} onChange={e => !done && onAns(e.target.value)} disabled={done} placeholder="Type your answer..."
        style={{ width: "100%", padding: "12px 16px", borderRadius: 10, boxSizing: "border-box", border: "1.5px solid " + (done ? (cor ? C.accent : C.wrong) : C.border), background: done ? (cor ? C.accentSoft : C.wrongSoft) : C.surface, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none" }} />
      {done && !cor && <div style={{ marginTop: 10, fontSize: 13, color: C.accent }}>Correct answer: <strong>{q.answer}</strong></div>}
      {done && q.explanation && <Expl text={q.explanation} C={C} />}
    </div>
  );
}

function Question({ q, i, ans, onAns, done, C }) {
  if (q.type === "multiple_choice") return <MCQ q={q} i={i} ans={ans} onAns={onAns} done={done} C={C} />;
  if (q.type === "true_false") return <TFQ q={q} i={i} ans={ans} onAns={onAns} done={done} C={C} />;
  if (q.type === "fill_in_the_blank") return <FIBQ q={q} i={i} ans={ans} onAns={onAns} done={done} C={C} />;
  return null;
}

function ScoreCard({ score, total, onRetry, onNew, C }) {
  const pct = Math.round((score / total) * 100);
  const gr = pct >= 80, ok = pct >= 50;
  return (
    <div style={{ background: "linear-gradient(180deg, " + C.card + ", " + C.surface + ")", borderRadius: 16, border: "1px solid " + C.border, padding: "48px 32px", textAlign: "center", marginBottom: 20 }}>
      <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 8, background: gr ? "linear-gradient(135deg, " + C.accent + ", #38C97A)" : ok ? "linear-gradient(135deg, #FFD166, #EF946C)" : "linear-gradient(135deg, " + C.wrong + ", #FF8F9E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{pct}%</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: C.text }}>{gr ? "Excellent!" : ok ? "Good effort!" : "Keep studying!"}</div>
      <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 32 }}>{score} of {total} correct</div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={onRetry} style={{ padding: "12px 24px", borderRadius: 10, border: "1px solid " + C.border, background: C.surface, color: C.text, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}><Ic.Refresh /> Retry</button>
        <button onClick={onNew} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.accent, color: C.bg, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>New Quiz <Ic.ArrowR /></button>
      </div>
    </div>
  );
}

export default function QuizLearn() {
  const [tp, setTp] = useState("dark");
  const C = useTheme(tp);
  const [screen, setScreen] = useState("upload");
  const [files, setFiles] = useState([]);
  const [paste, setPaste] = useState("");
  const [types, setTypes] = useState(["multiple_choice", "true_false", "fill_in_the_blank"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qs, setQs] = useState([]);
  const [ans, setAns] = useState({});
  const [done, setDone] = useState(false);

  const toggle = id => setTypes(p => p.includes(id) ? (p.length > 1 ? p.filter(t => t !== id) : p) : [...p, id]);
  const rmFile = x => { if (x === "all") setFiles([]); else setFiles(p => p.filter((_, i) => i !== x)); };
  const has = files.length > 0 || paste.trim().length > 20;

  const [status, setStatus] = useState("");
  const [analysis, setAnalysis] = useState(null);

  const gen = async () => {
    setLoading(true); setError(""); setStatus("Reading files...");
    try {
      let content = paste;
      for (let fi = 0; fi < files.length; fi++) {
        setStatus("Extracting text from " + files[fi].name + " (" + (fi + 1) + "/" + files.length + ")...");
        const t = await extractText(files[fi]);
        content += "\n\n--- From: " + files[fi].name + " ---\n" + t;
      }
      if (content.trim().length < 30) throw new Error("Not enough content. Add more text or files.");
      const result = await generateQuiz(content, types, 8, setStatus);
      if (!Array.isArray(result.quiz) || !result.quiz.length) throw new Error("No questions generated. Try more content.");
      setQs(result.quiz); setAnalysis(result.analysis); setAns({}); setDone(false); setScreen("quiz");
    } catch (e) { setError(e.message || "Something went wrong."); }
    finally { setLoading(false); setStatus(""); }
  };

  const submit = () => { setDone(true); setScreen("results"); };
  const calcScore = () => { let s = 0; qs.forEach((q, i) => { const a = ans[i]; if (a == null) return; if (q.type === "multiple_choice" && a === q.correct) s++; if (q.type === "true_false" && a === q.correct) s++; if (q.type === "fill_in_the_blank" && typeof a === "string" && a.toLowerCase().trim() === q.answer?.toLowerCase().trim()) s++; }); return s; };
  const allDone = qs.length > 0 && qs.every((_, i) => ans[i] != null && ans[i] !== "");
  const reset = () => { setScreen("upload"); setFiles([]); setPaste(""); setQs([]); setAns({}); setDone(false); setError(""); };
  const retry = () => { setAns({}); setDone(false); setScreen("quiz"); };

  const qTypes = [
    { id: "multiple_choice", label: "Multiple Choice", em: "\u25C9" },
    { id: "true_false", label: "True / False", em: "\u2696" },
    { id: "fill_in_the_blank", label: "Fill in the Blank", em: "\u270E" },
  ];
  const sec = { fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textDim, marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", position: "relative", overflow: "hidden", transition: "background 0.35s, color 0.35s" }}>
      <style>{"\
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap');\
        @keyframes spin{to{transform:rotate(360deg)}}\
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\
        *{box-sizing:border-box;margin:0;padding:0}\
        button:hover:not(:disabled){filter:brightness(1.06)}\
        textarea:focus,input:focus{outline:none}\
      "}</style>

      <div style={{ position: "fixed", top: "-40%", left: "-20%", width: "80%", height: "80%", background: "radial-gradient(ellipse, " + C.accentGlow + " 0%, transparent 70%)", opacity: C.glowOp, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px", position: "relative", zIndex: 1 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={reset}>
            <div style={{ color: C.accent, display: "flex" }}><Ic.Brain /></div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", background: "linear-gradient(135deg, " + C.text + " 40%, " + C.accent + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>QuizLearn</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 1 }}>AI-powered quizzes from your materials</div>
            </div>
          </div>
          <ThemeSwitch pref={tp} set={setTp} C={C} />
        </div>

        {screen === "upload" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={sec}>Upload Content</div>
            <DropZone files={files} onAdd={nf => setFiles(p => [...p, ...nf])} onRemove={rmFile} C={C} />

            <div style={{...sec, marginTop: 4}}>Or paste text directly</div>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder="Paste your notes, textbook excerpts, lecture summaries..."
              style={{ width: "100%", minHeight: 120, background: C.surface, border: "1px solid " + C.border, borderRadius: 12, padding: 16, color: C.text, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6, marginBottom: 20 }} />

            <div style={sec}>Question Types</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
              {qTypes.map(t => {
                const a = types.includes(t.id);
                return <button key={t.id} onClick={() => toggle(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: a ? "1.5px solid " + C.accent : "1px solid " + C.border, background: a ? C.accentSoft : C.surface, color: a ? C.accent : C.textMuted, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", transition: "all 0.2s" }}><span style={{ fontSize: 16 }}>{t.em}</span> {t.label}</button>;
              })}
            </div>

            {error && <div style={{ padding: "12px 16px", borderRadius: 10, background: C.wrongSoft, color: C.wrong, fontSize: 14, marginBottom: 16 }}>{error}</div>}

            <button onClick={gen} disabled={!has || !types.length || loading}
              style={{ width: "100%", padding: "16px 24px", borderRadius: 14, border: "none", background: (!has || loading) ? C.textDim : "linear-gradient(135deg, " + C.accent + ", " + C.accent + "dd)", color: (!has || loading) ? C.textMuted : C.bg, fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: (!has || loading) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.3s", boxShadow: has && !loading ? "0 4px 24px " + C.accentGlow : "none", opacity: loading ? 0.8 : 1 }}>
              {loading ? (<><span style={{ width: 18, height: 18, border: "2.5px solid " + C.bg, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />{status || "Processing..."}</>) : (<><Ic.Zap /> Generate Quiz</>)}
            </button>
          </div>
        )}

        {screen === "quiz" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              {analysis && analysis.subject ? <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.accent, marginBottom: 2 }}>{analysis.subject}</div> : null}
              <div style={sec}>{qs.length} Questions{analysis && analysis.topics ? " across " + analysis.topics.length + " topics" : ""}</div>
              <button onClick={reset} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>Start over</button>
            </div>
            <div style={{ height: 4, background: C.surface, borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
              <div style={{ height: "100%", width: (Object.keys(ans).length / qs.length) * 100 + "%", background: "linear-gradient(90deg, " + C.accent + ", " + C.accent + "bb)", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
            {qs.map((q, i) => <div key={i} style={{ animation: "fadeIn 0.3s ease " + (i * 0.05) + "s both" }}><Question q={q} i={i} ans={ans[i]} onAns={v => setAns(p => ({ ...p, [i]: v }))} done={done} C={C} /></div>)}
            <button onClick={submit} disabled={!allDone}
              style={{ width: "100%", padding: "16px 24px", borderRadius: 14, border: "none", background: allDone ? "linear-gradient(135deg, " + C.accent + ", " + C.accent + "dd)" : C.textDim, color: allDone ? C.bg : C.textMuted, fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: allDone ? "pointer" : "not-allowed", marginTop: 12, boxShadow: allDone ? "0 4px 24px " + C.accentGlow : "none", transition: "all 0.3s" }}>
              {allDone ? "Submit Answers" : "Answer all (" + Object.keys(ans).length + "/" + qs.length + ")"}
            </button>
          </div>
        )}

        {screen === "results" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <ScoreCard score={calcScore()} total={qs.length} onRetry={retry} onNew={reset} C={C} />
            <div style={{...sec, marginTop: 32}}>Review</div>
            {qs.map((q, i) => <Question key={i} q={q} i={i} ans={ans[i]} onAns={() => {}} done={true} C={C} />)}
          </div>
        )}
      </div>
    </div>
  );
}
