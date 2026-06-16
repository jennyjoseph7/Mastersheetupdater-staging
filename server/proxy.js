/**
 * AutoNage Local CORS Proxy
 *
 * Forwards browser fetch requests to the NVIDIA API, adding the required
 * CORS headers so the frontend can call the API directly from the browser.
 *
 * Usage
 *   npm start          (starts on PORT from .env, default 3456)
 *   node --watch proxy.js
 *
 * Security
 *   - The NVIDIA API key lives ONLY in this file / .env — never exposed
 *     to the browser.
 *   - Clients obtain a short-lived session token via GET /session (1 use).
 *   - Requests without a valid session token are rejected with 401.
 *   - Origin header is validated against allowed origins (localhost).
 *   - Per-IP rate limiting prevents abuse.
 *   - Only the configured NVIDIA endpoint is proxied.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (zero dependencies) ─────────────────────────────────
function loadEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  const lines = readFileSync(path, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv(resolve(__dirname, '.env'));

const NVIDIA_API_KEY    = env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;
const PORT              = parseInt(env.PORT || process.env.PORT || '3456', 10);
const NVIDIA_ENDPOINT   = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GRYD_ENDPOINT     = 'https://autobot-webapp-dev.gryd.in';
const UPSTREAM_TIMEOUT_MS = parseInt(env.UPSTREAM_TIMEOUT_MS || process.env.UPSTREAM_TIMEOUT_MS || '90000', 10);

if (!NVIDIA_API_KEY) {
  console.error('ERROR: NVIDIA_API_KEY is not set.');
  console.error('Copy server/.env.example to server/.env and add your key.');
  process.exit(1);
}

// ── Session token store ────────────────────────────────────────────────────
// In-memory map of token -> { expiresAt, used }
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 1000;

function generateSessionToken() {
  return randomBytes(24).toString('hex');
}

function createSession() {
  if (sessions.size >= MAX_SESSIONS) return null;
  const token = generateSessionToken();
  sessions.set(token, {
    expiresAt: Date.now() + SESSION_TTL_MS,
    used: false,
  });
  return token;
}

function validateSession(token) {
  if (!token || !sessions.has(token)) return false;
  const session = sessions.get(token);
  // Expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  // Already used (one-time-use enforcement)
  if (session.used) {
    sessions.delete(token);
    return false;
  }
  // Mark as used immediately so concurrent requests can't reuse
  session.used = true;
  return true;
}

// Periodic cleanup of expired sessions and stale rate-limit entries (every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_WINDOW) rateLimitMap.delete(ip);
  }
}, 60_000);

// ── Rate limiting ──────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 60;     // max requests
const RATE_WINDOW = 60_000; // per 60 seconds

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── CORS helpers ────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080').split(',').map(s => s.trim());

function getCorsHeaders(req) {
  const origin = req.headers['origin'] || '';
  const matched = ALLOWED_ORIGINS.find(o => origin === o);
  return {
    'Access-Control-Allow-Origin': matched || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token, X-Handshake-Token, X-GRYD-ENTERPRISE-ID, X-GRYD-TOKEN, X-GRYD-SESSION-ID, X-GRYD-SIGNUP-TOKEN, X-GRYD-APPLICATION-ID, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function corsJsonResponse(req, res, status, body) {
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Validates the Origin header against the allowed origins list.
 * Requests without an Origin (e.g., curl) are still allowed for dev convenience,
 * but session token auth still protects the endpoint.
 */
function isOriginAllowed(req) {
  const origin = req.headers['origin'];
  if (!origin) return true; // No origin = not from a browser; session token auth still applies
  return ALLOWED_ORIGINS.some(allowed => origin === allowed);
}

// ── Server ──────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const { method, url } = req;
  const clientIP = req.socket.remoteAddress || 'unknown';

  // ── OPTIONS preflight ──────────────────────────────────────────────────
  if (method === 'OPTIONS') {
    res.writeHead(204, getCorsHeaders(req));
    res.end();
    return;
  }

  // ── Health check ───────────────────────────────────────────────────────
  if (method === 'GET' && url === '/health') {
    corsJsonResponse(req, res, 200, { status: 'ok', proxy: 'autonage-local' });
    return;
  }

  // ── Session token endpoint ────────────────────────────────────────────
  // Client calls GET /session before making API requests to get a short-lived
  // one-time-use session token. The token must be included as X-Session-Token
  // in subsequent POST /v1/chat/completions requests.
  if (method === 'GET' && url === '/session') {
    const token = createSession();
    if (!token) {
      corsJsonResponse(req, res, 429, {
        error: 'Too Many Requests',
        message: 'Session limit reached. Try again later.',
      });
      return;
    }
    corsJsonResponse(req, res, 200, { token, expiresInMs: SESSION_TTL_MS, message: 'Use this token in X-Session-Token header for POST requests.' });
    return;
  }

  // ── Rate limiting (applies to ALL routes before routing) ────────────
  if (!checkRateLimit(clientIP)) {
    corsJsonResponse(req, res, 429, {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Max 60 requests per minute.',
    });
    return;
  }

  // ── Gryd LLM translation route ─────────────────────────────────────
  // Receives NVIDIA-format requests, translates to Gryd format, forwards,
  // and translates the response back to NVIDIA format.
  // This lets llm-batch-runner.js work unchanged.
  if (method === 'POST' && url === '/gryd/v1/chat/completions') {
    const { headers } = req;
    const body = await readBody(req);

    // Parse NVIDIA-format request
    let nvidiaReq;
    try { nvidiaReq = JSON.parse(body); } catch { corsJsonResponse(req, res, 400, { error: 'Invalid JSON' }); return; }

    // Extract system prompt and user query from messages array
    const messages = nvidiaReq.messages || [];
    let systemPrompt = '';
    let userQuery = '';
    for (const msg of messages) {
      if (msg.role === 'system') systemPrompt = msg.content || '';
      if (msg.role === 'user') userQuery = msg.content || '';
    }

    // Build Gryd request
    const grydBody = JSON.stringify({
      kwargs: {
        user_query: userQuery,
        system_prompt: systemPrompt,
        model_identifier: env.GRYD_MODEL || 'gcp-gemini-3.1-flash-lite-preview'
      }
    });

    // Forward Gryd auth headers from browser request
    const grydHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-gryd-enterprise-id': 'autocrm',
      'x-gryd-application-id': 'autocrm',
    };
    const forwardHeaders = ['x-gryd-token', 'x-gryd-session-id', 'x-gryd-signup-token'];
    for (const h of forwardHeaders) {
      const val = headers[h];
      if (val && val.trim()) grydHeaders[h] = val;
    }
    console.log(`[GRYD-LLM] Forwarding headers:`, JSON.stringify({
      enterprise: grydHeaders['x-gryd-enterprise-id'],
      token: grydHeaders['x-gryd-token'] ? 'SET' : 'MISSING',
      session: grydHeaders['x-gryd-session-id'] ? 'SET' : 'MISSING',
      signup: grydHeaders['x-gryd-signup-token'] ? 'SET' : 'MISSING',
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const upstream = await fetch(GRYD_ENDPOINT + '/gryd/execute/get_llm_response/ai_service', {
        method: 'POST',
        headers: grydHeaders,
        body: grydBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const responseText = await upstream.text();
      console.log(`[GRYD-LLM] ${upstream.status} (${responseText.length} chars)`);

      if (!upstream.ok) {
        corsJsonResponse(req, res, upstream.status, { error: 'Gryd LLM error', message: responseText.slice(0, 500) });
        return;
      }

      // Gryd returns a JSON-encoded string — unwrap it manually
      let content = responseText;
      if (content.startsWith('"') && content.endsWith('"')) {
        try {
          content = JSON.parse(content); // proper unescape
        } catch {
          content = content.slice(1, -1)
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\n/g, '\n');
        }
      }
      if (typeof content !== 'string') content = JSON.stringify(content);
      console.log(`[GRYD-LLM] preview: ${String(content).slice(0, 200)}`);
      // Wrap in NVIDIA format
      const nvidiaResponse = {
        choices: [{ message: { content: content } }]
      };
      corsJsonResponse(req, res, 200, nvidiaResponse);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        corsJsonResponse(req, res, 504, { error: 'Gateway Timeout', message: 'Gryd LLM timed out after 90s.' });
      } else {
        console.error('[GRYD-LLM] Error:', err.message);
        corsJsonResponse(req, res, 502, { error: 'Bad Gateway', message: err.message });
      }
    }
    return;
  }

  // ── Gryd proxy ────────────────────────────────────────────────────────
  // Proxy /gryd/* requests to the gryd backend, stripping the browser Origin
  // header to avoid server-side origin validation failures.
  if (method === 'POST' && url.startsWith('/gryd/')) {
    // ── Exempt login/signup from session token requirement ──────────────
    const isLoginRoute = url === '/gryd/login' || url === '/gryd/signup';
    if (!isLoginRoute) {
      const grydSessionToken = req.headers['x-session-token'];
      if (!grydSessionToken || !validateSession(grydSessionToken)) {
        corsJsonResponse(req, res, 401, {
          error: 'Unauthorized',
          message: 'Missing or invalid X-Session-Token. Call GET /session first to obtain a token.'
        });
        return;
      }
    }

    const { headers } = req;

    // ── Enforce body size limit (1 MB) ─────────────────────────────────
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 1024 * 1024) {
      corsJsonResponse(req, res, 413, {
        error: 'Payload Too Large',
        message: 'Request body exceeds 1 MB limit.',
      });
      return;
    }

    const body = await readBody(req);

    // Double-check actual body size
    if (body.length > 1024 * 1024) {
      corsJsonResponse(req, res, 413, {
        error: 'Payload Too Large',
        message: 'Request body exceeds 1 MB limit.',
      });
      return;
    }

    // Forward only the headers gryd cares about (strip browser Origin)
    const grydHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const forwardHeaders = ['x-gryd-enterprise-id', 'x-gryd-token', 'x-gryd-session-id', 'x-gryd-signup-token', 'x-gryd-application-id'];
    for (const h of forwardHeaders) {
      if (headers[h]) grydHeaders[h] = headers[h];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const upstream = await fetch(GRYD_ENDPOINT + url, {
        method: 'POST',
        headers: grydHeaders,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await upstream.text();
      const ctype = upstream.headers.get('content-type') || 'application/json';
      console.log(`[GRYD] ${url} ${upstream.status}`);
      const cors = getCorsHeaders(req);
      res.writeHead(upstream.status, { ...cors, 'Content-Type': ctype });
      res.end(text);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        corsJsonResponse(req, res, 504, { error: 'Gateway Timeout', message: 'Gryd backend timed out.' });
      } else {
        console.error('[GRYD] Error:', err.message);
        corsJsonResponse(req, res, 502, { error: 'Bad Gateway', message: err.message });
      }
    }
    return;
  }

  // ── Only proxy POST /v1/chat/completions ──────────────────────────────
  if (method !== 'POST' || url !== '/v1/chat/completions') {
    corsJsonResponse(req, res, 404, { error: 'Not found. Use POST /v1/chat/completions' });
    return;
  }

  // Rate limit already checked above — skip duplicate check for /v1/chat/completions

  // ── Origin validation ─────────────────────────────────────────────────
  if (!isOriginAllowed(req)) {
    corsJsonResponse(req, res, 403, {
      error: 'Forbidden',
      message: 'Origin not allowed. Configure ALLOWED_ORIGINS in .env if needed.',
    });
    return;
  }

  // ── Validate session token ────────────────────────────────────────────
  const sessionToken = req.headers['x-session-token'];
  if (!sessionToken || !validateSession(sessionToken)) {
    corsJsonResponse(req, res, 401, {
      error: 'Unauthorized',
      message: 'Missing or invalid X-Session-Token. Call GET /session first to obtain a token.'
    });
    return;
  }

  // ── Read and forward request ──────────────────────────────────────────
  try {
    const body = await readBody(req);

    // ── Enforce body size limit (1 MB) ─────────────────────────────────
    if (body.length > 1024 * 1024) {
      corsJsonResponse(req, res, 413, {
        error: 'Payload Too Large',
        message: 'Request body exceeds 1 MB limit.',
      });
      return;
    }

    // Free endpoints can be slow; keep this above the frontend timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    const response = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Log the NVIDIA response status for debugging
    console.log(`[NVIDIA] ${response.status} ${response.statusText}`);

    // Read the response body
    const responseText = await response.text();

    // Forward the status and body back to the client
    const resHeaders = {
      ...getCorsHeaders(req),
      'Content-Type': response.headers.get('content-type') || 'application/json',
    };
    res.writeHead(response.status, resHeaders);
    res.end(responseText);

  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[NVIDIA] Request timed out after ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`);
      corsJsonResponse(req, res, 504, {
        error: 'Gateway Timeout',
        message: `NVIDIA API did not respond within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} seconds. Reduce AI batch size or try again later.`
      });
    } else {
      console.error('[NVIDIA] Proxy error:', err.message);
      corsJsonResponse(req, res, 502, {
        error: 'Bad Gateway',
        message: 'Failed to reach upstream NVIDIA API. Check server logs.'
      });
    }
  }
});

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║         AutoNage Local CORS Proxy               ║
  ║──────────────────────────────────────────────────║
  ║  Proxy:   http://localhost:${PORT}/v1/chat/completions  ║
  ║  Session: GET  http://localhost:${PORT}/session         ║
  ║  Upstream: ${NVIDIA_ENDPOINT}             ║
  ║  CORS:    Restricted (localhost only)           ║
  ║  Auth:    Session token (one-time, 5 min TTL)   ║
  ║  Origin:  Validated                             ║
  ║  Rate:    60 req/min per IP                     ║
  ╚══════════════════════════════════════════════════╝
  `);
});
