/* nav-init.js — Loads nav.html safely after ai-config.js defines loadNavSafe */
if (typeof loadNavSafe === 'function') {
  loadNavSafe('navContainer');
} else {
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof loadNavSafe === 'function') loadNavSafe('navContainer');
  });
}
