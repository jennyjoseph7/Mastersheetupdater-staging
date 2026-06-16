/* init.js — Theme + auth gate (runs before page renders to prevent flash) */
(function() {
  var theme = localStorage.getItem('jejo-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  function requireAuth() {
    var token = sessionStorage.getItem('gryd_token');
    var expiry = sessionStorage.getItem('gryd_expiry');
    if (!token || !expiry || parseInt(expiry) <= Math.floor(Date.now() / 1000)) {
      window.location.replace('../login.html');
      return false;
    }
    return true;
  }

  requireAuth();

  // Re-check on bfcache restore (back/forward navigation).
  // Check on EVERY pageshow, not just persisted — some browsers don't set persisted correctly.
  window.addEventListener('pageshow', function() { requireAuth(); });

  // Also check on visibility change — covers cases where bfcache fires
  // but pageshow fires before sessionStorage is updated.
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') requireAuth();
  });

  // Prevent bfcache by registering unload listener.
  // This forces a fresh page load on back/forward, so auth gate always runs.
  window.addEventListener('unload', function() {});
})();
