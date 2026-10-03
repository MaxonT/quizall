// Set window.QUIZALL_API_BASE before this script to use a separately hosted backend.
// Local static frontend on :4173 uses the backend on :8080; production defaults to same origin.
window.QUIZALL_API_BASE = window.QUIZALL_API_BASE ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:8080`
    : window.location.origin);
