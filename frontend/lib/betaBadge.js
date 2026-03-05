(function () {
  function getBadgeText() {
    if (window.i18n && typeof window.i18n.t === "function") {
      const v = window.i18n.t("beta.badge_text");
      if (v && v !== "beta.badge_text") return v;
    }
    return "BETA";
  }

  function getAriaLabel() {
    if (window.i18n && typeof window.i18n.t === "function") {
      const v = window.i18n.t("beta.badge_aria");
      if (v && v !== "beta.badge_aria") return v;
    }
    return "Beta version – subscription disabled";
  }

  function ensureBadge(container) {
    if (!container) return;

    const img = container.querySelector("img");
    if (!img) return;

    let wrap = img.parentElement;
    if (!wrap || !wrap.classList || !wrap.classList.contains("beta-logo-wrap")) {
      wrap = document.createElement("span");
      wrap.className = "beta-logo-wrap";
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
    }

    if (wrap.querySelector(".beta-badge")) return;

    const badge = document.createElement("span");
    badge.className = "beta-badge";
    badge.textContent = getBadgeText();
    badge.setAttribute("aria-label", getAriaLabel());
    wrap.appendChild(badge);
  }

  function apply() {
    document.querySelectorAll(".nav-logo").forEach(ensureBadge);
    document.querySelectorAll(".brand-logo").forEach(ensureBadge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
