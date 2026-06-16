/**
 * AutoNage Proxy — Cloudflare Worker
 *
 * Features:
 *   - Proxies /gryd/* POST requests to gryd backend (with CORS + origin stripping)
 *   - Proxies /v1/chat/completions to NVIDIA API
 *   - Handshake token auth for NVIDIA routes
 *   - CORS for all origins
 *   - Rate limiting
 */

// ── Config ─────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = '*';  // Allows all origins (safe for dev/staging)

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GRYD_ENDPOINT = 'https://autobot-webapp-dev.gryd.in';
const DEFAULT_UPSTREAM_TIMEOUT_MS = 90_000;

// ── Rate limiting ──────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 1000;
const RATE_WINDOW = 60_000;

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

// ── CORS headers (allows ALL origins) ──────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Handshake-Token, X-GRYD-ENTERPRISE-ID, X-GRYD-TOKEN, X-GRYD-SESSION-ID, X-GRYD-SIGNUP-TOKEN, X-GRYD-APPLICATION-ID, Accept',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ── Request handler ─────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const startedAt = Date.now();
    const url = new URL(request.url);

    const NVIDIA_API_KEY = env.NVIDIA_API_KEY;
    const UPSTREAM_TIMEOUT_MS = Number(env.UPSTREAM_TIMEOUT_MS) > 0
      ? Number(env.UPSTREAM_TIMEOUT_MS) : DEFAULT_UPSTREAM_TIMEOUT_MS;

    // ── Preflight ─────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Health check ───────────────────────────────────────────────────
    if (method === 'GET') {
      if (url.pathname !== '/health') {
        return jsonResponse(404, { error: 'Not found. Use GET /health' });
      }
      return jsonResponse(200, { status: 'ok', proxy: 'autonage-cloudflare' });
    }

    if (method !== 'POST') {
      return jsonResponse(404, { error: 'Use POST' });
    }

    // ── Rate limit ────────────────────────────────────────────────────
    if (!checkRateLimit(clientIP)) {
      return jsonResponse(429, { error: 'Too Many Requests', message: 'Rate limit exceeded.' });
    }

    // ── GRYD LLM TRANSLATION ROUTE ─────────────────────────────────────
    // Translates NVIDIA-format chat requests to gryd's LLM endpoint
    if (url.pathname === '/gryd/v1/chat/completions') {
      const body = await request.text();
      let nvidiaReq;
      try { nvidiaReq = JSON.parse(body); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

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

      const grydHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-gryd-enterprise-id': 'autocrm',
        'x-gryd-application-id': 'autocrm'
      };
      for (const h of ['x-gryd-token', 'x-gryd-session-id', 'x-gryd-signup-token']) {
        const v = request.headers.get(h);
        if (v) grydHeaders[h] = v;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      try {
        const upstream = await fetch(GRYD_ENDPOINT + '/gryd/execute/get_llm_response/ai_service', {
          method: 'POST', headers: grydHeaders, body: grydBody, signal: controller.signal,
        });
        clearTimeout(timeout);
        const responseText = await upstream.text();
        if (!upstream.ok) {
          return jsonResponse(upstream.status, { error: 'Gryd LLM error', message: responseText.slice(0, 500) });
        }
        let content = responseText;
        if (content.startsWith('"') && content.endsWith('"')) {
          try { content = JSON.parse(content); } catch {
            content = content.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
          }
        }
        if (typeof content !== 'string') content = JSON.stringify(content);
        return jsonResponse(200, { choices: [{ message: { content: content } }] });
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') return jsonResponse(504, { error: 'Gateway Timeout', message: 'Gryd LLM timed out.' });
        return jsonResponse(502, { error: 'Bad Gateway', message: err.message });
      }
    }

    // ── GRYD PROXY ROUTE (login, etc.) ───────────────────────────────
    // Forwards /gryd/* requests to gryd backend, strips browser origin
    if (url.pathname.startsWith('/gryd/')) {
      const grydHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      for (const h of ['x-gryd-enterprise-id', 'x-gryd-token', 'x-gryd-session-id', 'x-gryd-signup-token', 'x-gryd-application-id']) {
        const val = request.headers.get(h);
        if (val) grydHeaders[h] = val;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const body = await request.text();
        if (body.length > 1024 * 1024) {
          return jsonResponse(413, { error: 'Payload Too Large', message: 'Request body exceeds 1 MB limit.' });
        }
        const upstream = await fetch(GRYD_ENDPOINT + url.pathname, {
          method: 'POST', headers: grydHeaders, body, signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await upstream.text();
        const ctype = upstream.headers.get('content-type') || 'application/json';
        return new Response(text, { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': ctype } });
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') return jsonResponse(504, { error: 'Gateway Timeout', message: 'Gryd backend timed out.' });
        return jsonResponse(502, { error: 'Bad Gateway', message: err.message });
      }
    }

    // ── NVIDIA PROXY ────────────────────────────────────────────────────
    const HANDSHAKE_TOKEN = env.HANDSHAKE_TOKEN;
    if (HANDSHAKE_TOKEN) {
      const token = request.headers.get('X-Handshake-Token');
      if (!token || token !== HANDSHAKE_TOKEN) {
        return jsonResponse(401, { error: 'Unauthorized', message: 'Missing or invalid handshake token.' });
      }
    }
    if (!NVIDIA_API_KEY) {
      return jsonResponse(500, { error: 'Server Error', message: 'NVIDIA_API_KEY not configured on the Worker.' });
    }

    try {
      const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
      if (contentLength > 1024 * 1024) {
        return jsonResponse(413, { error: 'Payload Too Large', message: 'Request body exceeds 1 MB limit.' });
      }
      const body = await request.text();
      if (body.length > 1024 * 1024) {
        return jsonResponse(413, { error: 'Payload Too Large', message: 'Request body exceeds 1 MB limit.' });
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
        headers: { ...corsHeaders, 'Content-Type': contentType, 'X-AutoNage-Upstream-Duration-Ms': durationMs },
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        return jsonResponse(504, { error: 'Gateway Timeout', message: `NVIDIA API did not respond within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} seconds.` });
      }
      return jsonResponse(502, { error: 'Bad Gateway', message: `Failed to reach NVIDIA API: ${err.message}` });
    }
  },
};
