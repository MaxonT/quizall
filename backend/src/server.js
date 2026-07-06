import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth.js";
import { billingRouter, stripeWebhookRouter } from "./routes/billing.js";
import { analyticsRouter } from "./routes/analytics.js";
import { analyticsDashboardRouter } from "./routes/analyticsDashboard.js";
import { adminRouter } from "./routes/admin.js";
import { oauthRouter } from "./routes/oauth.js";
import { quizRouter } from "./routes/quiz.js";
import { dailyRefreshJob } from "./lib/dailyRefreshJob.js";
import dailyCompensationJob from "./lib/dailyCompensationJob.js";
import { FEATURES } from "./lib/subscriptionConfig.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const app = express();
const isProd = process.env.NODE_ENV === "production";

// 生产环境在 Render 等单层反向代理后：用 1 而非 true，避免 express-rate-limit 报 ERR_ERL_PERMISSIVE_TRUST_PROXY（trust proxy true 会允许伪造 X-Forwarded-For 绕过 IP 限流）
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// 生产环境必须显式配置 CORS_ORIGIN，禁止通配符
const CORS_ORIGIN_RAW = (process.env.CORS_ORIGIN || (isProd ? "" : "*")).trim();
const CORS_ALLOWED = CORS_ORIGIN_RAW === "*" ? ["*"] : CORS_ORIGIN_RAW.split(",").map((o) => o.trim()).filter(Boolean);
if (isProd && (!CORS_ORIGIN_RAW || CORS_ORIGIN_RAW === "*")) {
  console.error("[quizall] WARNING: CORS_ORIGIN must be set to explicit origin(s) in production. Cross-origin requests will be blocked.");
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!isProd && CORS_ALLOWED[0] === "*") return cb(null, true);
    if (isProd && (CORS_ALLOWED.length === 0 || CORS_ALLOWED[0] === "*")) return cb(null, false);
    const ok = CORS_ALLOWED.includes(origin);
    if (!ok) console.warn(`[quizall] CORS blocked origin: "${origin}" (allowed: ${CORS_ALLOWED.join(", ")})`);
    cb(null, ok);
  },
  credentials: true
}));
app.use(helmet());

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use("/api/stripe", stripeWebhookRouter);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

function shouldSkipApiLimiter(req) {
  const path = (req.path || "").split("?")[0];
  const original = (req.originalUrl || req.url || "").split("?")[0];
  const isHealth =
    path === "/health" ||
    path === "/api/health" ||
    original === "/health" ||
    original === "/api/health" ||
    original.startsWith("/api/health/");
  const isStripeWebhook =
    path.startsWith("/stripe/webhook") ||
    path.startsWith("/api/stripe/webhook") ||
    original.startsWith("/api/stripe/webhook");
  return isHealth || isStripeWebhook;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { ok: false, error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipApiLimiter,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: "Too many authentication attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const quizGenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, error: "Too many quiz generation requests. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

const analyticsTrackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { ok: false, error: "Too many analytics events." },
  standardHeaders: true,
  legacyHeaders: false,
});

const couponRedeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: "Too many coupon attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/quiz/generate', quizGenerateLimiter);
app.use('/api/analytics/track', analyticsTrackLimiter);
app.use('/api/billing/redeem-coupon', couponRedeemLimiter);
app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[quizall] ← ${req.method} ${req.path}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[quizall] → ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.get("/api/health", (req, res) => {
  const anthropicConfigured = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
  res.json({
    ok: true,
    status: "healthy",
    time: new Date().toISOString(),
    anthropic: {
      configured: anthropicConfigured,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    },
  });
});

app.get("/api/settings", (req, res) => {
  res.json({
    ok: true,
    settings: {
      features: {
        quizGeneration: true,
        fileUpload: true,
        history: true,
        subscriptionsEnabled: FEATURES.subscriptionsEnabled,
        enforceTokenLimits: FEATURES.enforceTokenLimits,
      },
    },
  });
});

console.log(`[quizall] Registering API routes...`);

app.use("/api/auth", authRouter);
console.log(`[quizall]   ✓ /api/auth`);

app.use("/api/quiz", quizRouter);
console.log(`[quizall]   ✓ /api/quiz`);

app.use("/api/billing", billingRouter);
console.log(`[quizall]   ✓ /api/billing`);
console.log(`[quizall]   ✓ /api/stripe/webhook`);

app.use("/api/analytics", analyticsRouter);
console.log(`[quizall]   ✓ /api/analytics`);

app.use("/api/analytics/dashboard", analyticsDashboardRouter);
console.log(`[quizall]   ✓ /api/analytics/dashboard`);

app.use("/api/admin", adminRouter);
console.log(`[quizall]   ✓ /api/admin`);

app.use("/api/auth/oauth", oauthRouter);
console.log(`[quizall]   ✓ /api/auth/oauth`);

console.log(`[quizall] ✅ All API routes registered`);

if (FEATURES.subscriptionsEnabled) {
  dailyRefreshJob.startScheduler();
  console.log(`[quizall] 🔄 Daily token refresh scheduler started`);
  dailyCompensationJob.scheduleDailyJob("02:00");
  console.log(`[quizall] 🔧 Daily compensation job scheduled`);
}

app.get("/", (req, res) => {
  if (isProd) {
    return res.json({ ok: true, service: "QuizAll Backend API", status: "running" });
  }
  res.json({
    ok: true,
    service: "QuizAll Backend API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    availableEndpoints: {
      health: "GET /api/health",
      settings: "GET /api/settings",
      quiz: {
        generate: "POST /api/quiz/generate",
        history: "GET /api/quiz/history",
        saveResult: "POST /api/quiz/history",
        deleteResult: "DELETE /api/quiz/history/:id",
      },
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        me: "GET /api/auth/me",
        oauth: "GET /api/auth/oauth/:provider/authorize",
      },
      billing: {
        plans: "GET /api/billing/plans",
        status: "GET /api/billing/status",
      },
    },
  });
});

app.use("/api/*", (req, res) => {
  res.status(404).json({
    ok: false,
    error: "API endpoint not found",
    path: req.path,
    method: req.method,
  });
});

// 行业惯例：全局错误处理，统一返回 { ok: false, error }，生产环境不泄露堆栈
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("[quizall] Unhandled error:", err);
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : (err.message || String(err));
  res.status(500).json({ ok: false, error: message });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[quizall] backend listening on :${PORT}`);
  console.log(`[quizall] 🚀 Backend is ready!`);
});
