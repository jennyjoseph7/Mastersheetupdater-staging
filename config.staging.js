/**
 * AutoNage - Staging Configuration
 *
 * This file IS tracked in git so it gets deployed to the staging site.
 * ⚠ Fill in your grydSignupToken below before testing login on staging.
 *
 * The key difference from config.js: grydEndpoint points to the Cloudflare Worker
 * instead of localhost, so the staging site can reach the gryd backend.
 */

window.JEJO_CONFIG = window.JEJO_CONFIG || {};

// Staging-specific overrides — these override whatever config.js set
Object.assign(window.JEJO_CONFIG, {
  // Route through Cloudflare Worker so gryd doesn't reject the browser origin
  grydEndpoint: "https://autnongageleadoperations.jennyjosephofc1.workers.dev",

  // ⚠ You MUST fill this in for login to work on staging
  //    Edit this file on GitHub at:
  //    https://github.com/jennyjoseph7/Mastersheetupdater-staging/blob/main/config.staging.js
  grydSignupToken: "",

  useGrydLlm: true,

  // --- AI PERFORMANCE TUNING ---
  llmBatchSize: 30,
  llmMaxConcurrent: 5,
  llmMaxRetries: 1,
  llmRequestTimeoutMs: 45000,

  llmDispositionBatchSize: 25,
  llmDispositionMaxConcurrent: 5,
  llmDispositionTimeoutMs: 60000,
});
