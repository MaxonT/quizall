import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { db } from "./lib/db.js";
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

dotenv.config();
const app = express();

// 生产环境在 Render 等单层反向代理后：用 1 而非 true，避免 express-rate-limit 报 ERR_ERL_PERMISSIVE_TRUST_PROXY（trust proxy true 会允许伪造 X-Forwarded-For 绕过 IP 限流）
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// 支持单个域名或逗号分隔多域名，例如：https://quizall.app 或 https://quizall.app,https://www.quizall.app,https://newdomain.com
const CORS_ORIGIN_RAW = (process.env.CORS_ORIGIN || "*").trim();
const CORS_ALLOWED = CORS_ORIGIN_RAW === "*" ? ["*"] : CORS_ORIGIN_RAW.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: CORS_ALLOWED[0] === "*" ? "*" : (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = CORS_ALLOWED.includes(origin) || CORS_ALLOWED.includes("*");
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { ok: false, error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.path.startsWith('/api/stripe/webhook'),
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

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/quiz/generate', quizGenerateLimiter);
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
  res.json({ ok: true, status: "healthy", time: new Date().toISOString() });
});

app.get("/api/settings", (req, res) => {
  res.json({
    ok: true,
    settings: {
      env: process.env.NODE_ENV || "development",
      features: {
        quizGeneration: true,
        fileUpload: true,
        history: true,
      }
    }
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
  res.json({
    ok: true,
    service: "QuizAll Backend API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "production",
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
