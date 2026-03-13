// ============================================
// QuizAll Frontend - API Configuration
// ============================================
// 
// ⚠️  部署到 Render 时，前端和后端是不同的子域名：
//   前端: quizall-frontend-bqn7.onrender.com (Static Site)
//   后端: quizall-backend-0qr4.onrender.com (Web Service)
//
// 你需要把下面 RENDER_BACKEND_URL 改成你实际的后端 URL。
// 本地开发不需要改，默认指向 localhost:8080。
// ============================================

const RENDER_BACKEND_URL = "https://quizall-backend-0qr4.onrender.com";

const hostname = window.location.hostname;
const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

// Production frontend is deployed as a static site, while the API lives on Render.
// A custom domain like quiz-all.com still needs to call the backend service directly.
window.QUIZALL_API_BASE = isLocalhost
  ? "http://localhost:8080"
  : RENDER_BACKEND_URL;

window.QUIZALL_MAINTENANCE_MODE = false;

console.log("[QuizAll] API Base:", window.QUIZALL_API_BASE);
