function getStoredTheme() {
  return localStorage.getItem('jejo-theme') || 'dark';
}
function syncBrandLogo(theme) {
  document.querySelectorAll('.brand-mark img').forEach(img => {
    img.src = theme === 'dark' ? img.dataset.darkLogo : img.dataset.lightLogo;
  });
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('jejo-theme', theme);
  syncBrandLogo(theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
applyTheme(getStoredTheme());
