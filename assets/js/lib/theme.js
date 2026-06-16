/**
 * theme.js — Shared dark/light theme management
 *
 * Every page loads this file instead of duplicating these 4 functions inline.
 * The inline <script> block in each <head> that sets data-theme before render
 * MUST stay — it prevents Flash of Unstyled Content (FOUC).
 */

function getStoredTheme() {
  return localStorage.getItem('jejo-theme') || 'dark';
}

function syncBrandLogo(theme) {
  document.querySelectorAll('.brand-mark img').forEach(function(img) {
    img.src = theme === 'dark' ? img.dataset.darkLogo : img.dataset.lightLogo;
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('jejo-theme', theme);
  syncBrandLogo(theme);
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
