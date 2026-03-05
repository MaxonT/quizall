/**
 * Redeem Coupon Bubble
 * 
 * A floating pill button that opens a small modal for entering a coupon code.
 * Include this module on any page to add the redeem UI.
 * 
 * Usage: <script type="module" src="lib/redeemBubble.js"></script>
 */

(function () {
  const API_BASE =
    (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) ||
    (window.location && window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost:8080");

  // ── Inject Styles ──────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
/* Floating Redeem Bubble */
.redeem-bubble {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 9999;
  background: linear-gradient(135deg, var(--accent, #6c5ce7), var(--accent-hover, #a855f7));
  color: #fff;
  border: none;
  border-radius: 50px;
  padding: 12px 22px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(108, 92, 231, 0.4);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.redeem-bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 28px rgba(108, 92, 231, 0.55);
}
.redeem-bubble:active {
  transform: translateY(0);
}
.redeem-bubble__icon {
  font-size: 1.1rem;
  line-height: 1;
}

/* Redeem Modal Overlay */
.redeem-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s, visibility 0.25s;
}
.redeem-overlay.open {
  opacity: 1;
  visibility: visible;
}

/* Redeem Modal Card */
.redeem-modal {
  background: var(--card-bg, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: 16px;
  padding: 28px 32px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
  transform: translateY(20px);
  transition: transform 0.25s;
}
.redeem-overlay.open .redeem-modal {
  transform: translateY(0);
}
.redeem-modal__title {
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text, #fff);
}
.redeem-modal__subtitle {
  margin: 0 0 20px;
  font-size: 0.85rem;
  color: var(--text-secondary, #aaa);
}
.redeem-modal__input-group {
  display: flex;
  gap: 8px;
}
.redeem-modal__input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border, #444);
  border-radius: 10px;
  background: var(--input-bg, #2a2a3c);
  color: var(--text, #fff);
  font-size: 0.95rem;
  font-family: monospace;
  letter-spacing: 0.5px;
  outline: none;
  transition: border-color 0.2s;
}
.redeem-modal__input:focus {
  border-color: var(--accent, #6c5ce7);
}
.redeem-modal__input::placeholder {
  color: var(--text-secondary, #888);
  font-family: inherit;
  letter-spacing: 0;
}
.redeem-modal__submit {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--accent, #6c5ce7), var(--accent-hover, #a855f7));
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;
}
.redeem-modal__submit:hover {
  opacity: 0.9;
}
.redeem-modal__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.redeem-modal__message {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  display: none;
}
.redeem-modal__message.success {
  display: block;
  background: rgba(46, 213, 115, 0.12);
  color: #2ed573;
  border: 1px solid rgba(46, 213, 115, 0.25);
}
.redeem-modal__message.error {
  display: block;
  background: rgba(255, 71, 87, 0.12);
  color: #ff4757;
  border: 1px solid rgba(255, 71, 87, 0.25);
}
.redeem-modal__close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: var(--text-secondary, #aaa);
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 4px;
}
.redeem-modal__close:hover {
  color: var(--text, #fff);
}
`;
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────────────────

  // Floating pill button
  const bubble = document.createElement("button");
  bubble.className = "redeem-bubble";
  bubble.innerHTML = `<span class="redeem-bubble__icon">🎟️</span> Redeem`;
  bubble.setAttribute("aria-label", "Redeem a coupon code");
  document.body.appendChild(bubble);

  // Modal overlay
  const overlay = document.createElement("div");
  overlay.className = "redeem-overlay";
  overlay.innerHTML = `
    <div class="redeem-modal" style="position:relative;">
      <button class="redeem-modal__close" aria-label="Close">&times;</button>
      <h3 class="redeem-modal__title">Redeem Coupon</h3>
      <p class="redeem-modal__subtitle">Enter your coupon code to activate your subscription</p>
      <div class="redeem-modal__input-group">
        <input class="redeem-modal__input" type="text" placeholder="e.g. QUIZALL-XXXX" maxlength="30" autocomplete="off" spellcheck="false" />
        <button class="redeem-modal__submit">Apply</button>
      </div>
      <div class="redeem-modal__message"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Refs
  const modal = overlay.querySelector(".redeem-modal");
  const closeBtn = overlay.querySelector(".redeem-modal__close");
  const input = overlay.querySelector(".redeem-modal__input");
  const submitBtn = overlay.querySelector(".redeem-modal__submit");
  const messageEl = overlay.querySelector(".redeem-modal__message");

  // ── Helpers ────────────────────────────────────────────────────────────

  function getAuthToken() {
    try {
      return localStorage.getItem("quizall.token") || null;
    } catch {
      return null;
    }
  }

  function openModal() {
    overlay.classList.add("open");
    input.value = "";
    messageEl.className = "redeem-modal__message";
    messageEl.textContent = "";
    messageEl.style.display = "none";
    setTimeout(() => input.focus(), 150);
  }

  function closeModal() {
    overlay.classList.remove("open");
  }

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `redeem-modal__message ${type}`;
    messageEl.style.display = "block";
  }

  async function redeemCoupon() {
    const code = input.value.trim();
    if (!code) {
      showMessage("Please enter a coupon code", "error");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      showMessage("Please log in first to redeem a coupon", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Applying…";
    messageEl.style.display = "none";

    try {
      const resp = await fetch(`${API_BASE}/api/billing/redeem-coupon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await resp.json();

      if (resp.ok && data.ok) {
        showMessage(data.message || "Coupon redeemed! Your subscription is now active.", "success");
        // Refresh status after short delay so the user sees the success message
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        showMessage(data.error || "Failed to redeem coupon", "error");
      }
    } catch (err) {
      showMessage("Network error — please try again", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Apply";
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────

  bubble.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  submitBtn.addEventListener("click", redeemCoupon);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      redeemCoupon();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      closeModal();
    }
  });
})();
