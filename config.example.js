/**
 * AutoNage - Lead Operations Automation Configuration
 * 
 * Instructions:
 * 1. Copy/Rename this file to "config.js" in the same folder.
 * 2. Fill in the tokens marked ⚠ below (get them from your team).
 * 3. The non-secret defaults are already filled in.
 */

window.JEJO_CONFIG = {
  // --- GRYD AI BACKEND ---
  // Base URL for the gryd AI service API.
  // For local dev: set to "http://localhost:3456" and run: cd server && npm start
  // For production: set to your Cloudflare Worker URL
  grydEndpoint: "http://localhost:3456",

  // Gryd model identifier
  grydModel: "gcp-gemini-3.1-flash-lite-preview",

  // Signup token for gryd login authentication.
  // Get this from the gryd team (required — without it login will fail).
  // ⚠ REPLACE THIS
  grydSignupToken: "",

  // --- AI PERFORMANCE TUNING ---
  // Increased for gryd speed — gryd handles high concurrency well.
  llmBatchSize: 30,
  llmMaxConcurrent: 5,
  llmMaxRetries: 1,
  llmRequestTimeoutMs: 45000,
  llmPromptCharLimit: 1200,
  llmMaxOutputTokens: 1600,

  // Disposition validation uses longer transcripts.
  llmDispositionBatchSize: 25,
  llmDispositionMaxConcurrent: 5,
  llmDispositionTimeoutMs: 60000,
  llmDispositionPromptCharLimit: 2500,
  llmDispositionMaxOutputTokens: 1800,

  // --- RECORDING DOWNLOAD PROXY (CORS FIX) ---
  // Some recording URLs are hosted on servers that block cross-origin requests (CORS).
  // Set this to a proxy endpoint (e.g., a Cloudflare Worker) that fetches the recording
  // and returns it with permissive CORS headers.
  corsProxyUrl: ""
};
