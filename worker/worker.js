/**
 * AutoNage NVIDIA API Proxy — Cloudflare Worker
 *
 * Deploy this Worker to bypass corporate network blocks on NVIDIA domains.
 * The Worker runs on Cloudflare's network, which CAN reach the NVIDIA API.
 *
 * Features:
 *   - Forwards POST requests to the NVIDIA API
 *   - NVIDIA API key stays server-side (never exposed to browsers)
 *   - Handshake token authenticates your frontend
 *   - CORS headers allow browser access
 *   - Rate limiting (60 req/min per IP)
 */

// ── Configuration ──────────────────────────────────────────────────────────

// Set these via Cloudflare Dashboard → Worker → Settings → Variables
// NEVER hardcode secrets in this file!

// Set your actual frontend domains here (must match config.js origins).
// The '*' wildcard is NOT allowed in production — it lets any site proxy requests.
const ALLOWED_ORIGINS = ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080'];

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GRYD_ENDPOINT = 'https://autobot-webapp-dev.gryd.in';
const DEFAULT_UPSTREAM_TIMEOUT_MS = 90_000;

// ── Rate limiting (simple in-memory per IP) ──────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 60;      // max requests
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
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const matched = ALLOWED_ORIGINS.find(o => origin === o);
  return {
    'Access-Control-Allow-Origin': matched || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Handshake-Token, X-GRYD-ENTERPRISE-ID, X-GRYD-TOKEN, X-GRYD-SESSION-ID, X-GRYD-SIGNUP-TOKEN, X-GRYD-APPLICATION-ID, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

// ── Request handler ─────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const startedAt = Date.now();

    // Read secrets from env (set via Cloudflare Dashboard → Settings → Variables)
    const NVIDIA_API_KEY = env.NVIDIA_API_KEY;
    const UPSTREAM_TIMEOUT_MS = Number(env.UPSTREAM_TIMEOUT_MS) > 0
      ? Number(env.UPSTREAM_TIMEOUT_MS)
      : DEFAULT_UPSTREAM_TIMEOUT_MS;

    // ── Parse URL once for all routing ────────────────────────────────
    const url = new URL(request.url);

    // Compute CORS headers once per request
    const cors = getCorsHeaders(request);

    // ── Preflight ───────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── Health check ────────────────────────────────────────────────────
    if (method === 'GET') {
      if (url.pathname !== '/health') {
        return jsonResponse(404, { error: 'Not found. Use GET /health' }, cors);
      }
      return jsonResponse(200, { status: 'ok', proxy: 'autonage-cloudflare' }, cors);
    }

    // ── Rate limit (applies to all POST routes) ─────────────────────────
    if (!checkRateLimit(clientIP)) {
      return jsonResponse(429, {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Max 60 requests per minute.',
      }, cors);
    }

    // ── Gryd LLM translation route ───────────────────────────────────
    // Receives NVIDIA-format requests, translates to Gryd format, forwards,
    // and translates the response back to NVIDIA format.
    if (method === 'POST' && url.pathname === '/gryd/v1/chat/completions') {
      // Exempt from handshake token — Gryd uses its own auth headers
      const body = await request.text();
      let nvidiaReq;
      try { nvidiaReq = JSON.parse(body); } catch { return jsonResponse(400, { error: 'Invalid JSON' }, cors); }

      const messages = nvidiaReq.messages || [];
      let systemPrompt = '';
      let userQuery = '';
      for (const msg of messages) {
        if (msg.role === 'system') systemPrompt = msg.content || '';
        if (msg.role === 'user') userQuery = msg.content || '';
      }

      const grydBody = JSON.stringify({
        kwargs: {
          user_query: userQuery,
          system_prompt: systemPrompt,
          model_identifier: env.GRYD_MODEL || 'gcp-gemini-3.1-flash-lite-preview'
        }
      });

      const grydHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-gryd-enterprise-id': 'autocrm', 'x-gryd-application-id': 'autocrm' };
      const fwdHdrs = ['x-gryd-token', 'x-gryd-session-id', 'x-gryd-signup-token'];
      for (const h of fwdHdrs) { const v = request.headers.get(h); if (v) grydHeaders[h] = v; }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      try {
        const upstream = await fetch(GRYD_ENDPOINT + '/gryd/execute/get_llm_response/ai_service', {
          method: 'POST', headers: grydHeaders, body: grydBody, signal: controller.signal,
        });
        clearTimeout(timeout);
        const responseText = await upstream.text();
        if (!upstream.ok) {
          return jsonResponse(upstream.status, { error: 'Gryd LLM error', message: responseText.slice(0, 500) }, cors);
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
        // Wrap in NVIDIA format
        return jsonResponse(200, { choices: [{ message: { content: content } }] }, cors);
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') return jsonResponse(504, { error: 'Gateway Timeout', message: 'Gryd LLM timed out.' }, cors);
        return jsonResponse(502, { error: 'Bad Gateway', message: err.message }, cors);
      }
    }

    // ── Gryd proxy ──────────────────────────────────────────────────────
    // Proxy /gryd/* requests to the gryd backend, stripping the browser
    // Origin header to avoid server-side origin validation failures.
    if (method === 'POST' && url.pathname.startsWith('/gryd/')) {
      // ── Exempt login/signup from handshake token requirement ──────────
      const isLoginRoute = url.pathname === '/gryd/login' || url.pathname === '/gryd/signup';
      if (!isLoginRoute) {
        const HANDSHAKE_TOKEN = env.HANDSHAKE_TOKEN;
        if (!HANDSHAKE_TOKEN) {
          return jsonResponse(500, {
            error: 'Server Error',
            message: 'HANDSHAKE_TOKEN is not configured on the Worker. Set it in Worker Settings > Variables.',
          }, cors);
        }
        const token = request.headers.get('X-Handshake-Token');
        if (!token || token !== HANDSHAKE_TOKEN) {
          return jsonResponse(401, {
            error: 'Unauthorized',
            message: 'Missing or invalid handshake token. Set proxyHandshakeToken in config.js.',
          }, cors);
        }
      }

      const grydHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      const forwardHeaders = ['x-gryd-enterprise-id', 'x-gryd-token', 'x-gryd-session-id', 'x-gryd-signup-token', 'x-gryd-application-id'];
      for (const h of forwardHeaders) {
        const val = request.headers.get(h);
        if (val) grydHeaders[h] = val;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const body = await request.text();

        // Enforce body size limit (1 MB)
        if (body.length > 1024 * 1024) {
          return jsonResponse(413, {
            error: 'Payload Too Large',
            message: 'Request body exceeds 1 MB limit.',
          }, cors);
        }

        const upstream = await fetch(GRYD_ENDPOINT + url.pathname, {
          method: 'POST',
          headers: grydHeaders,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await upstream.text();
        const ctype = upstream.headers.get('content-type') || 'application/json';
        return new Response(text, {
          status: upstream.status,
          headers: { ...cors, 'Content-Type': ctype },
        });
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          return jsonResponse(504, { error: 'Gateway Timeout', message: 'Gryd backend timed out.' }, cors);
        }
        return jsonResponse(502, { error: 'Bad Gateway', message: err.message }, cors);
      }
    }

    // ── Only proxy POST ─────────────────────────────────────────────────
    if (method !== 'POST') {
      return jsonResponse(404, { error: 'Use POST /v1/chat/completions' }, cors);
    }

    // Rate limit already checked above — skip duplicate

    // ── Authentication ─────────────────────────────────────────────────────
    // HANDSHAKE_TOKEN (env secret) — validate X-Handshake-Token header against it.
    // Set HANDSHAKE_TOKEN in: Cloudflare Dashboard → Worker → Settings → Variables.
    // Set the same value in config.js → proxyHandshakeToken.
    const HANDSHAKE_TOKEN = env.HANDSHAKE_TOKEN;
    if (!HANDSHAKE_TOKEN) {
      return jsonResponse(500, {
        error: 'Server Error',
        message: 'HANDSHAKE_TOKEN is not configured on the Worker. Set it in Worker Settings > Variables.',
      }, cors);
    }
    const token = request.headers.get('X-Handshake-Token');
    if (!token || token !== HANDSHAKE_TOKEN) {
      return jsonResponse(401, {
        error: 'Unauthorized',
        message: 'Missing or invalid handshake token. Set proxyHandshakeToken in config.js.',
      }, cors);
    }

    // Origin validation
    {
      const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
      if (origin && !ALLOWED_ORIGINS.some(o => origin === o)) {
        return jsonResponse(403, {
          error: 'Forbidden',
          message: 'Origin not allowed.',
        }, cors);
      }
    }

    // ── Validate API key is configured ──────────────────────────────────
    if (!NVIDIA_API_KEY) {
      return jsonResponse(500, {
        error: 'Server Error',
        message: 'NVIDIA_API_KEY is not configured on the server. Add it in Worker Settings > Variables.',
      }, cors);
    }

    // ── Forward to NVIDIA ───────────────────────────────────────────────
    try {
      // Enforce request body size limit BEFORE reading (prevent DoS via oversized payloads)
      const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
      if (contentLength > 1024 * 1024) {  // 1 MB max
        return jsonResponse(413, {
          error: 'Payload Too Large',
          message: 'Request body exceeds 1 MB limit.',
        }, cors);
      }

      const body = await request.text();

      // Double-check actual body size (Content-Length may be absent or inaccurate)
      if (body.length > 1024 * 1024) {
        return jsonResponse(413, {
          error: 'Payload Too Large',
          message: 'Request body exceeds 1 MB limit.',
        }, cors);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

      const nvResponse = await fetch(NVIDIA_ENDPOINT, {
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

      const responseText = await nvResponse.text();
      const contentType = nvResponse.headers.get('content-type') || 'application/json';
      const durationMs = String(Date.now() - startedAt);

      return new Response(responseText, {
        status: nvResponse.status,
        headers: {
          ...cors,
          'Content-Type': contentType,
          'X-AutoNage-Upstream-Duration-Ms': durationMs,
        },
      });

    } catch (err) {
      if (err.name === 'AbortError') {
        return jsonResponse(504, {
          error: 'Gateway Timeout',
          message: `NVIDIA API did not respond within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} seconds. Reduce AI batch size or try again later.`,
        }, {
          ...cors,
          'X-AutoNage-Upstream-Duration-Ms': String(Date.now() - startedAt),
        });
      }
      console.error('Proxy error:', err.message);
      return jsonResponse(502, {
        error: 'Bad Gateway',
        message: 'Failed to reach upstream NVIDIA API. Check server logs.',
      }, {
        ...cors,
        'X-AutoNage-Upstream-Duration-Ms': String(Date.now() - startedAt),
      });
    }
  },
};
