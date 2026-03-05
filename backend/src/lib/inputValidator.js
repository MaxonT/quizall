/**
 * inputValidator.js — Prompt Input Validation Module
 *
 * Standalone gate that runs BEFORE the pipeline.
 * Determines whether a raw user input is a legitimate prompt optimization request.
 *
 * Core philosophy: "Prompt 是用AI来解决问题的文字表现"
 * If someone describes a PROBLEM they want to solve → it is VALID.
 * If someone requests an ACTION on an OBJECT → it is VALID.
 * Only reject pure noise: emotion venting, keyword fragments, abstract feelings.
 *
 * Model: llama-3.3-70b-versatile (Groq) — strong multilingual understanding.
 * Failure is always fail-open (never blocks the pipeline on error).
 */

import { chatJson } from "./llmRouter.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const VALIDATOR_MODEL = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
};

// ─── Rejection messages (≤ 20 words, same language as input) ─────────────────

const REJECT_MESSAGES = {
  en: "QuizAll generates quizzes. Tell me what you want AI to do — e.g. \"Write a cover letter for a software engineer role\".",
  zh: "QuizAll 专注 Quiz 生成。请描述你想让 AI 做什么，例如「帮我写一封请假邮件给老板」。",
  mixed: "QuizAll generates quizzes / 专注 Quiz 生成。Describe a task for AI — e.g. \"Help me write an email to my professor asking for an extension\".",
};

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * @param {string} input
 * @returns {Promise<{ isValid: boolean, rejectReason: string|null, rejectMessage: string|null }>}
 */
export async function validatePromptInput(input) {
  if (!input || input.trim().length === 0) {
    return { isValid: false, rejectReason: "empty_input", rejectMessage: REJECT_MESSAGES.en };
  }

  try {
    const { data } = await chatJson({
      provider: VALIDATOR_MODEL.provider,
      model: VALIDATOR_MODEL.model,
      temperature: 0,
      system: `You are a classifier for a Quiz Generation tool called QuizAll.

Core philosophy: A Prompt is the textual expression of using AI to solve a problem.
If someone writes a prompt, they MUST be trying to use AI to solve some problem they face.
Your job is to be PERMISSIVE — accept anything that could reasonably be a request for AI help,
and ONLY reject inputs that are clearly NOT problem-solving requests at all.

═══════════════════════════════════════
GOLDEN RULE #1 — PROBLEM = VALID
═══════════════════════════════════════
If the input DESCRIBES A PROBLEM the user is facing → ALWAYS VALID.
Why? Because describing a problem to an AI tool IS asking for help.
The user came to a prompt optimization tool — they want AI to help solve it.

Examples of problems (ALL VALID):
  "这个页面有一个超级大的logo，不好看，帮我修改前端"     → VALID (frontend problem)
  "my API returns 500 errors when I POST with a large body" → VALID (backend problem)
  "I need to migrate my database from MySQL to PostgreSQL"   → VALID (migration problem)

═══════════════════════════════════════
GOLDEN RULE #2 — ACTION + OBJECT = VALID
═══════════════════════════════════════
If the input contains BOTH:
  (A) any action verb (in ANY language): write, help, create, make, draft, explain,
      analyze, summarize, translate, review, generate, build, code, design, fix, debug,
      modify, change, update, improve, optimize, refactor, implement, configure, setup,
      deploy, test, migrate, troubleshoot, resolve, repair, check, convert, integrate,
      帮我, 写, 做, 改, 修改, 修复, 创建, 生成, 优化, 分析, 解释, 翻译, 调试, 部署,
      检查, 转换, 实现, 配置, 测试, 排查, 解决, 重构, 设计, 开发, 编写, 搭建...
  (B) any concrete object/topic: email, code, page, website, app, API, database,
      frontend, backend, UI, CSS, function, component, logo, button, layout, feature,
      bug, error, script, server, prompt, essay, letter, report, plan, message,
      presentation, outline, summary, 页面, 代码, 前端, 后端, 接口, 样式, 按钮,
      组件, 功能, 邮件, 文章, 报告, 计划, 脚本, 服务器, 数据库...

→ ALWAYS VALID. No exceptions.

═══════════════════════════════════════
GOLDEN RULE #3 — BIAS TOWARD VALID
═══════════════════════════════════════
When in doubt, mark as VALID. It is MUCH worse to reject a legitimate prompt
than to accept a borderline one. The downstream pipeline can handle imperfect inputs.

If the input is messy, has typos, has URLs, has mixed languages, has dashes/symbols,
has emotional language mixed with a task — as long as there is ANY identifiable
problem or task buried in it → VALID.

═══════════════════════════════════════
VALID — accept ALL of these patterns
═══════════════════════════════════════
  "write a Python web scraper for e-commerce prices"
  "help me write an email to my professor, I'm feeling sick today"
  "帮我写邮件给教授申请延期，语气要礼貌"
  "explain recursion with simple examples for beginners"
  "review my essay introduction for clarity and tone"
  "create a workout plan for a beginner with no equipment"
  "这个页面：https://example.com/page.html 帮我修改一下前端！logo太大了"
  "fix the bug where login redirects to the wrong page"
  "my code throws a TypeError, help me debug it"
  "帮我优化一下这个SQL查询，太慢了"
  "I want to build a todo app with React and Node.js"
  "deploy my app to AWS, it keeps failing"
  "这个按钮点了没反应，帮我检查一下代码"
  "想做一个小游戏，帮我设计一下架构"
  "帮我写一下请假邮件，今天感冒了去不了课了"
  "how do I center a div in CSS"
  "refactor this function to use async/await"

═══════════════════════════════════════
INVALID — reject ONLY these 4 patterns
═══════════════════════════════════════
(1) Pure emotion venting with ZERO task/problem:
  "完了我明天要presentation脑子一团浆糊"       → pure_emotion
  "这个人讲话太绕了根本听不懂他说啥"           → pure_emotion
  "I'm so stressed out right now"                → pure_emotion
  
(2) Scattered keywords — no verb, no sentence at all:
  "internship cs remote no sponsor maybe startup" → keyword_fragment
  "coffee rain focus python deadline"             → keyword_fragment

(3) Pure abstract feeling — no problem, no task:
  "我想要那种感觉，就是很稳，很强，不慌"        → abstract_feeling

(4) Meta product feedback (talking ABOUT AI, not TO AI):
  "让AI把我说不清楚的话变成我真正想说的话"       → product_idea

KEY: If it has BOTH emotion AND a task/problem → it is VALID, not pure_emotion.
     "完了我明天presentation，帮我写开场白" → VALID (has task)
     "完了我明天presentation脑子乱了" → pure_emotion (no task)

═══════════════════════════════════════
LANGUAGE DETECTION
═══════════════════════════════════════
  - Input has English main clause → "en"
  - Input is primarily Chinese → "zh"
  - Genuinely mixed → "mixed"
  - Other → "other"

═══════════════════════════════════════
REJECTION MESSAGE RULES
═══════════════════════════════════════
When rejecting, write a "reject_message" that:
- Is in the SAME LANGUAGE as the detected language
- Quotes the specific part of their input
- Explains in 1 sentence why
- Gives ONE concrete rewrite example
- Is friendly, not condescending

Output JSON only — no explanation, no markdown:
{
  "is_valid": true | false,
  "language": "en" | "zh" | "mixed" | "other",
  "reject_reason": null | "pure_emotion" | "keyword_fragment" | "no_action_intent" | "abstract_feeling" | "product_idea",
  "reject_message": null | "<specific explanation in the detected language only>"
}`,
      user: input.trim(),
    });

    if (data?.is_valid === true) {
      return { isValid: true, rejectReason: null, rejectMessage: null };
    }

    const lang = data?.language === "zh"
      ? "zh"
      : data?.language === "mixed"
      ? "mixed"
      : "en";

    // Prefer LLM-generated specific message; fall back to static template
    const rejectMessage = (data?.reject_message && data.reject_message.trim())
      ? data.reject_message.trim()
      : REJECT_MESSAGES[lang];

    return {
      isValid: false,
      rejectReason: data?.reject_reason ?? "no_action_intent",
      rejectMessage,
      language: lang,
    };

  } catch (err) {
    // Validator errors must never block the pipeline — fail open
    console.warn("[inputValidator] Validation error (fail-open):", err.message);
    return { isValid: true, rejectReason: null, rejectMessage: null };
  }
}
