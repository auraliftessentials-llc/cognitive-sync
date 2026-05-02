/**
 * Service worker registrar with iframe + preview guards.
 * Loaded as a plain <script> from the document head — runs in the browser only.
 *
 * NEVER registers when:
 *   - inside an iframe (Lovable editor preview)
 *   - on a *.lovableproject.com or id-preview-* host
 *   - Service Worker API not available
 */
(function () {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  var inIframe = false;
  try { inIframe = window.self !== window.top; } catch (_) { inIframe = true; }

  var host = window.location.hostname;
  var isPreview =
    host.indexOf("id-preview--") === 0 ||
    host.indexOf("lovableproject.com") !== -1 ||
    host.indexOf("localhost") !== -1 ||
    host.indexOf("127.0.0.1") !== -1;

  if (inIframe || isPreview) {
    // Defensive cleanup: if a SW was previously registered in a non-safe
    // context, unregister it so the editor doesn't get stuck on stale builds.
    navigator.serviceWorker.getRegistrations()
      .then(function (regs) { regs.forEach(function (r) { r.unregister(); }); })
      .catch(function () {});
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(function (reg) {
        // Auto-update: when a new SW is found, activate immediately.
        reg.addEventListener("updatefound", function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", function () {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(function (err) {
        console.warn("[Merkabah SW] registration failed:", err);
      });
  });

  // Expose a tiny global for debug / kill-switch.
  window.__merkabah = {
    killSW: function () {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.active) reg.active.postMessage({ type: "KILL" });
      });
    },
  };
})();
