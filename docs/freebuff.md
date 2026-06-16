# 🧠 Buffy's Memory File — AutoNage / Mastersheetupdater

> This is my personal diary. When I read this file at the start of a session, I instantly
> understand the project's soul — what it does, how it's built, what's been fixed, and
> what patterns to follow. Update this every time I make changes.

---

## 📋 Project Identity

- **Name**: AutoNage (repo: `Mastersheetupdater`)
- **What it does**: Browser-based automotive lead operations automation tools. Takes AutoEngage exports → processes them → outputs Zoho Master Sheet-ready data.
- **Users**: Business Analysts (BAs) at a car dealership group. They upload Excel files, click buttons, download results.
- **AI Backend**: **Gryd AI** only — NVIDIA/OpenRouter removed (June 2026).
- **Auth**: Gryd session-based (JWT tokens via `sessionStorage`).
- **Proxies**: Local Node.js proxy (dev) + Cloudflare Worker (prod).

---

## 🏗️ Architecture (Current — June 2026)

### File Structure

```
/ (root)                      ← Served as static site
├── index.html                ← Landing page + auth gate
├── login.html                ← Standalone login page (root level)
├── config.js                 ← Gryd settings & API keys (gitignored!)
├── config.example.js         ← Template for config
├── nav.html                  ← Shared navigation injected via fetch
│
├── pages/                    ← 8 tools = self-contained HTML files
│   ├── login.html
│   ├── disposition_sync_v2.html  ← PRE-SALES SYNC (~4K lines, ~88 fns)
│   ├── post_sales_disposition.html ← POST-SALES SYNC (~4K lines, ~85 fns)
│   ├── campaign_generator.html    ← CAMPAIGN OBJECTIVE GENERATOR
│   ├── recording_renamer.html     ← RECORDING RENAMER
│   ├── autongage_formatter.html   ← AUTOENGAGE FORMATTER
│   ├── call_analysis_summary.html ← CALL SUMMARY
│   ├── reattempt_filter.html      ← RE-ATTEMPT FILTER
│   └── dashboard.html             ← CAMPAIGN DASHBOARD (~5K lines, ~65 fns)
│
├── assets/
│   ├── js/
│   │   ├── init.js                ← Theme + auth gate IIFE
│   │   ├── nav-init.js            ← nav.html loader
│   │   ├── vendor/                ← Self-hosted 3rd-party libs
│   │   └── lib/                   ← First-party shared libs (12 files)
│   ├── styles/                    ← 11 CSS files (1 design-system + 10 page)
│   ├── fonts/                     ← Self-hosted Inter, Manrope, IBM Plex Mono
│   └── images/                    ← Brand logos
│
├── server/proxy.js            ← Local Node.js proxy
├── worker/worker.js           ← Cloudflare Worker (production)
├── docs/                      ← Full architecture map, memory file, specs
└── test-data.csv
```

### Current Architecture Summary

| Aspect | Detail |
|--------|--------|
| **Pattern** | Static multipage app — standalone HTML files |
| **Framework** | None — pure vanilla JS |
| **Build system** | None — works directly from disk |
| **State management** | In-memory + localStorage + sessionStorage |
| **AI model** | Gryd AI (gcp-gemini-3.1-flash-lite-preview) |
| **Auth** | Gryd JWT tokens (sessionStorage) |
| **Data format** | Excel I/O via SheetJS (XLSX) |
| **Tests** | **0** — no test files exist |

---

## 🧩 Architecture Review Findings (June 15, 2026)

### ⛔ Critical Issues

| Issue | Severity | Detail |
|-------|----------|--------|
| Code duplication | **HIGH** | `normalizePhone`, `cellToString`, `readFileAsArrayBuffer`, `esc` duplicated across all 8 pages
| Monolithic pages | **HIGH** | 3 pages exceed 100K chars inline JS (dashboard: 187K, pre-sales: 127K, post-sales: 117K)
| Dead code | **MED** | `call_analysis_summary.html` loads `config.js` but never uses it
| Dead lib files | **LOW** | Legacy `assets/lib/` duplicates of `assets/js/lib/` versions
| Inline theme dupes | **LOW** | 3 standalone pages have inline theme functions (not using `theme.js`)
| Config order | **LOW** | `post_sales_disposition.html` loads `config.js` LAST — unique inconsistency
| No tests | **HIGH** | Zero test files across the entire project
| No build system | **MED** | No bundler, transpilation, or type checking

### 🏆 Strengths

- **Self-contained**: Every page works offline once assets are cached
- **No framework lock-in**: Pure vanilla JS — easy to maintain or migrate
- **Auth consistency**: Gryd login gates all tools via `index.html`
- **Shared nav**: `nav.html` is a single source of truth for all 8 tool links
- **Shared libs**: 12 extracted shared utilities reduce duplication
- **CSS design system**: 7 tool pages share one `design-system.css`
- **No circular imports**: Dependency graph is fully acyclic

---

## ⚙️ AI Pipeline (llm-batch-runner.js)

This is the heart of the AI validation. Key behavior:

- **Batches items** into configurable groups
- **Runs concurrent workers** (up to `maxConcurrent`)
- **Adaptive throttling**: starts with `minGapMs` gap, backs off on 429s, recovers after 5 successes
- **Retries with split**: if a batch fails all retries, splits it in half and retries halves
- **Returns ordered results** as `Map<rowIndex, result>`
- **Gryd-only**: No NVIDIA/OpenRouter fallback. Uses `grydEndpoint` + `grydModel` from config.

### Where config lives
- Dashboard: `llmBatchSize: 12`, `llmMaxConcurrent: 2`, `llmRequestTimeoutMs: 120000`
- Disposition: `llmDispositionBatchSize: 5`, `llmDispositionMaxConcurrent: 3`, `llmDispositionTimeoutMs: 90000`

### API Endpoint Resolution
1. Each page defines `getApiEndpoint()` inline → `cfg.grydEndpoint + '/gryd/v1/chat/completions'`
2. Uses Gryd auth headers: `X-GRYD-TOKEN`, `X-GRYD-SESSION-ID`, `X-GRYD-ENTERPRISE-ID`
3. No direct NVIDIA/OpenRouter fallbacks exist

---

## 🔧 Bug Fix Log (Chronological)

### June 2026

| # | Issue | Fix |
|---|-------|-----|
| 1 | Syntax errors in HTML/JS mix | Removed duplicate `{}` patterns
| 2 | Cache persistence bug | Moved cache write inside correct code path
| 3 | CORS errors on deployment | Use Cloudflare Worker as proxy
| 4 | Performance tuning | Workers: 2→5→2, Batch: 15→10→2→1→5
| 5 | Temp files cleaned | Removed 9 scratch files from root
| 6 | Unused files cleanup | Deleted `tools/`, `cloudflare-worker/`, orphaned JS
| 7 | "Unexpected token 'catch'" in dashboard | Fixed unclosed `else {` block
| 8 | Formula injection (XSS) | Created `excel-safe.js`, patched 5 pages
| 9 | Dashboard XSS | Wrapped 3 LLM values in `esc()`
| 10 | Recording Renamer security | Added max count/size limits
| 11 | Proxy security | Added 1MB body limit, configurable CORS origins
| 12 | Architecture refactoring (Phases 1-5) | Created 12 shared libs, shared nav via fetch
| 13 | Gryd login system | New `login.html`, proxy `/gryd/*` routes, auth gate on index
| 14 | Campaign Generator tool | New standalone page with 3 campaign families
| 15 | NVIDIA/OpenRouter → Gryd-only | Removed all NVIDIA API keys, endpoints, key UI
| 16 | Pre-sales parseResponse JSON fix | Try JSON.parse first before regex extraction
| 17 | Gryd model name in requests | Fixed `getLlmModel()` to check `useGrydLlm`
| 18 | Post-sales AI auth 502/400 "Unauthorized user, session_id is required" | `buildHeaders` in post_sales had conditional `if (cfg.useGrydLlm)` that could fall through to non-Gryd auth headers (X-Handshake-Token / Bearer). Pre-sales was already fixed (unconditional Gryd headers). Applied same fix to post-sales.

---

## 🚀 Deployment

- **Production**: CloudFront (S3) or any static host
- **Config**: `config.js` must be deployed separately (gitignored)
- **Cloudflare Worker**: Deploy `worker/worker.js` with env vars:
  - `NVIDIA_API_KEY`, `HANDSHAKE_TOKEN`, `UPSTREAM_TIMEOUT_MS`
  - Also proxies gryd backend at `https://autobot-webapp-dev.gryd.in`
- **Local Dev**: `cd server && npm start` (port 3456, needs `.env` file)

### CSP Strategy (Post-NVIDIA removal)
```
connect-src 'self' http://localhost:3456
# (gryd endpoint depends on deployment; add https://your-gryd-endpoint.com as needed)
```

---

## 📝 Conventions I Must Follow

1. **Never assume libraries exist** — check imports in each file
2. **Vanilla JS everywhere** — no frameworks, no build step
3. **config.js is gitignored** — never commit API keys
4. **Self-contained HTML** — each page includes all its own JS/CSS inline
5. **Brace matching in HTML** — always double-check `{}` balance in inline JS
6. **Theme system** — `data-theme` attribute, `localStorage('jejo-theme')`
7. **Theme functions** — `theme.js` shared for 8 main pages; **3 standalone pages have inline duplicates** (login, pages/login, campaign_generator)
8. **Event handlers** — all use `onclick=` attributes
9. **Path references** — pages in `pages/` reference assets as `../assets/...`
10. **Gryd auth** — `index.html` gates all tools behind login
11. **Standalone CSS** — `index.css`, `login.css`, `campaign-generator.css` each define their OWN theme variables
12. **nav.html** — shared across 8 tool pages, 1 source of truth
13. **Gryd-only LLM** — all AI calls go through `cfg.grydEndpoint + '/gryd/v1/chat/completions'`
14. **No NVIDIA/OpenRouter** — all related code has been removed; don't reintroduce it

---

## 🔴 Remaining Issues (Not Fixed)

1. **Dead `'nvidia'` engine labels** in `dashboard.html` — 3 cosmetic string references remain (whitespace mismatch prevents clean removal)
2. **`worker/worker.js`** — still has NVIDIA API code for non-gryd paths
3. **`server/proxy.js`** — `used: false` dead field in `createSession()`
4. **Duplicate lib files**: `assets/lib/` duplicates of `assets/js/lib/` versions
5. **Inline theme duplication**: 3 standalone pages with inline theme functions
6. **call_analysis_summary.html** loads `config.js` but never uses AI
7. **post_sales_disposition.html** loads `config.js` LAST
8. **buildHeaders inconsistency**: When fixing auth in one AI page, check all 3 (disposition_sync_v2, post_sales_disposition, dashboard) — they each have their own `buildHeaders` in `validateDispositionsWithLLM`
8. **Monolithic inline scripts** — dashboard (187K), pre-sales (127K), post-sales (117K) should be extracted to `.js` files
9. **No build system** — Vite or similar could bundle + tree-shake
10. **No tests** — zero test files across the entire project

---

## 🧩 Installed Agent Skills

| Skill | Source | Installs |
|-------|--------|----------|
| `@frontend-design` | `anthropics/skills` | 513.5K |
| `@xlsx` | `anthropics/skills` | 104.1K |
| `@improve-codebase-architecture` | `mattpocock/skills` | 223.3K |
| `@webapp-testing` | `anthropics/skills` | 90.5K |
| `@error-handling` | `affaan-m/everything-claude-code` | 1.2K |
