# 🏗️ AutoNage Architecture — File-by-File Reference

> **Purpose**: Before making any change, read this file first. It maps every function,
> every connection, and every ripple effect. If I change X, what breaks in Y?

---

## 📌 Quick Reference: What Goes Where

### File Role Map

| File | Role | Depends On | Used By |
|------|------|------------|---------|
| `index.html` | Landing page / tool catalog / auth gate | `config.js`, `assets/scripts/index.js`, `assets/css/index.css`, `assets/fonts/fonts.css` | Users opening the site |
| `login.html` | Standalone login page (root) | `config.js`, `assets/styles/login.css`, `assets/fonts/fonts.css` | Users redirected from index.html |
| `pages/login.html` | Login page (for pages/ context) | `../config.js`, `../assets/styles/login.css`, `../assets/fonts/fonts.css` | Users redirected from sub-pages |
| `config.js` | API keys, settings, gryd config (gitignored) | Nothing | index.html, login, all AI tools |
| `assets/js/lib/ai-config.js` | Shared AI config — endpoints, keys, sanitizer | `config.js` (via `window.JEJO_CONFIG`) | All 3 AI pages |
| `assets/js/lib/ai-validator.js` | Shared AI validation pipeline (StatusBar, headers, cache) | `ai-config.js` | `disposition_sync_v2.html`, `post_sales_disposition.html`, `dashboard.html` |
| `assets/js/lib/llm-batch-runner.js` | AI batch processing engine | `ai-config.js` | `dashboard.html`, `post_sales_disposition.html`, `disposition_sync_v2.html` |
| `assets/js/lib/history-helpers.js` | Session history parsing | Nothing | `post_sales_disposition.html`, `disposition_sync_v2.html` |
| `assets/js/lib/data-pipeline.js` | Shared data parsing (parseSheet, cellToString, etc.) | `XLSX` | All 7 tool pages |
| `assets/js/lib/date-utils.js` | Shared date parsing (detectDateFormat, parseDate, etc.) | Nothing | Pages that handle dates |
| `assets/js/lib/excel-safe.js` | Formula injection protection | Nothing | 5 export pages |
| `assets/js/lib/batch-export.js` | Shared batch export with prefix isolation | Nothing | `reattempt_filter.html`, `autongage_formatter.html` |
| `assets/js/lib/theme.js` | Shared theme toggle (getStoredTheme, applyTheme, toggleTheme) | Nothing | ALL HTML pages (via inline <script>) |
| `assets/js/lib/xlsx.full.min.js` | SheetJS — Excel parsing | Nothing | ALL tools |
| `assets/js/lib/jszip.min.js` | ZIP compression | Nothing | `recording_renamer.html` |
| `assets/js/lib/html2canvas.min.js` | Screenshot capture | Nothing | `dashboard.html` |
| `assets/js/lib/jspdf.umd.min.js` | PDF generation | `html2canvas` | `dashboard.html` |
| `assets/scripts/index.js` | Theme toggle (landing page only) | Nothing | `index.html` only |
| `assets/fonts/fonts.css` | Self-hosted fonts | Nothing | ALL HTML files |
| `assets/css/design-system.css` | Shared CSS — theme vars, reset, header/nav, theme-toggle, buttons, status bars | Nothing | ALL 7 tool pages (EXCEPT campaign_generator) |
| `assets/css/*.css` | Per-tool styles (9 files) | `fonts.css`, `design-system.css` (except campaign-generator.css which is standalone) | Corresponding page |
| `worker/worker.js` | Production AI proxy (Cloudflare) — proxies gryd backend + NVIDIA endpoint | Cloudflare env vars | `config.js` (apiEndpoint) |
| `server/proxy.js` | Local dev AI proxy (Node.js) — proxies gryd backend + NVIDIA endpoint | `.env` file | `config.js` (apiEndpoint) |

---

## 🔗 Script Load Order (Critical!)

Each HTML page loads `<script>` tags in order. The order matters because scripts depend on each other:

**ALL pages load (processing):**
```html
1. <inline blocking script>        — sets data-theme before render
2. assets/fonts/fonts.css          — font loading
3. assets/js/lib/xlsx.full.min.js     — SheetJS
```

**Then per-page:**

| Page | Config | theme.js | ai-config | history-helpers | llm-batch-runner | data-pipeline | date-utils | excel-safe | Extras |
|------|--------|-----------|--------|-----------------|-------------------|--------------|------------|------------|--------|
| `disposition_sync_v2.html` | ⚠️ after xlsx | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `post_sales_disposition.html` | **LAST** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `dashboard.html` | after xlsx | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | html2canvas, jspdf |
| `recording_renamer.html` | after xlsx | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | jszip |
| `call_analysis_summary.html` | after xlsx | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | — |
| `reattempt_filter.html` | ❌ NOT LOADED | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | — |
| `autongage_formatter.html` | ❌ NOT LOADED | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | — |
| `campaign_generator.html` | ❌ NOT LOADED | ❌ (inline) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| `login.html` | ✅ first | ✅ (inline) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| `pages/login.html` | ✅ first | ✅ (inline) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |

**⚠️ NOTE:** `post_sales_disposition.html` loads `config.js` LAST — different from everyone else. This means `window.JEJO_CONFIG` is available later in that page's lifecycle. This is a known inconsistency.

**`campaign_generator.html`** has its own standalone CSS (`campaign-generator.css`) with STATIC theme variables — both dark and light tokens baked into `:root`. It has NO design-system.css dependency. Theme functions are inline (not from theme.js).

**`login.html` / `pages/login.html`** have their own standalone `login.css` with its own custom theme variables. Theme functions are inline (duplicates of theme.js logic). They load `config.js` FIRST for gryd endpoint credentials.

---

## 🔐 Gryd Login System

The project now has an authentication layer powered by the **gryd AI backend**:

### How it works

1. **`index.html`** has an inline blocking `<script>` that checks `localStorage` for `gryd_token` + `gryd_expiry`. If missing or expired, redirects to `login.html`.
2. **`login.html`** (root) and **`pages/login.html`** provide the login UI:
   - Email/User ID + Password form
   - Toggle password visibility
   - Error messages with auto-dismiss
   - Loading spinner on submit
   - Server-side session info display
3. **Login POST** sends to `GRYD_ENDPOINT + '/gryd/login'` with:
   - `X-GRYD-ENTERPRISE-ID: 'autocrm'`
   - `X-GRYD-SIGNUP-TOKEN` from config
   - Body: `{ user_id, password, role: 'human_agent', attribute: 'email', application_id: 'autocrm' }`
4. On success, stores: `gryd_token`, `gryd_session_id`, `gryd_enterprise_id`, `gryd_user_id`, `gryd_expiry`
5. Session expiry is displayed as "Xh Ym remaining"

### Gryd Proxy Routes

Both `worker/worker.js` and `server/proxy.js` now proxy `/gryd/*` requests:

- Match `POST /gryd/*`
- Strip browser `Origin` header (avoids server-side origin validation failures)
- Forward selected headers: `x-gryd-enterprise-id`, `x-gryd-token`, `x-gryd-session-id`, `x-gryd-signup-token`, `x-gryd-application-id`
- 30s timeout, return 504/502 on failure
- CORS headers include gryd-specific headers

**CORS config changes** — both proxy and worker now allow these additional headers:
- `X-GRYD-ENTERPRISE-ID`, `X-GRYD-TOKEN`, `X-GRYD-SESSION-ID`, `X-GRYD-SIGNUP-TOKEN`, `X-GRYD-APPLICATION-ID`

---

## 🔗 Theme Toggle — SHARED (theme.js) + Inline Duplicates (2 standalone pages)

Theme functions are extracted to `assets/js/lib/theme.js` for all 7 main tool pages + index.html.

**Exception pages** that have INLINE theme functions (duplicates):
- `login.html` — inline `syncBrandLogo()`, `applyTheme()`, `toggleTheme()` plus additional `togglePassword()`, `setLoading()`, `showError()`, etc.
- `pages/login.html` — same as above (duplicate)
- `pages/campaign_generator.html` — inline `syncBrandLogo()`, `applyTheme()`, `toggleTheme()`

| File | Theme Source |
|------|-------------|
| `index.html` | `assets/js/lib/theme.js` (via `<script>`) + inline IIFE for FOUC |
| All 7 `pages/*.html` (except campaign_generator) | `assets/js/lib/theme.js` (via `<script>`) + inline IIFE for FOUC |
| `pages/campaign_generator.html` | Inline functions (NOT from theme.js) |
| `login.html` | Inline functions (NOT from theme.js) |
| `pages/login.html` | Inline functions (NOT from theme.js) |

**✅ If you fix a theme bug**, update `assets/js/lib/theme.js` AND the 3 standalone pages with inline duplicates.

---

## 🔄 Data Flow Diagrams

### Pre-Sales Sync (disposition_sync_v2.html)
```
User Uploads File 1 (Audience & Leads) ─┐
                                         ├──→ parseSheet() → detect columns → normalize
User Uploads File 2 (Sessions) ──────────┘
                                                   ↓
                                            mergeData() ← detectHistory() + formatHistoryForPrompt()
                                                   ↓
                                            buildQualityReport() → renderQualityReport()
                                                   ↓
                                            renderTable() + renderStats() → User reviews
                                                   ↓
                                         [Optional: AI Validation]
                                            validateDispositionsWithLLM()
                                              → runLlmBatches() → parseResponse → renderTable()
                                                   ↓
                                            exportToExcel() or copyData() or copyConvertedData()
```

### Post-Sales Sync (post_sales_disposition.html)
```
User Uploads File 1 ─┐
                      ├──→ parseSheet() → scoreFileRole() [auto-detect leads vs sessions]
User Uploads File 2 ─┘            │
                                  ↓
                    evaluateFileRoles() → may swap files if auto-detected
                                  ↓
                    buildSessionMap() ← detectHistory() + formatHistoryForPrompt()
                                  ↓
                    classifyDisposition() for each lead (keyword-based)
                                  ↓
                    buildQualityReport()
                                  ↓
                    renderAll() → Stats + Quality + Table + Preview tables
                                  ↓
                    [Optional: AI Validation] → runLlmBatches()
                                  ↓
                    exportToExcel() or copyData() or copyPreviewRows()
```

### Dashboard Flow (dashboard.html)
```
User Uploads Zoho Export → parse → normalize
              ↓
    generateDashboard()
              ↓
    ┌─────────┼─────────┬──────────────┬──────────────┐
    ↓         ↓         ↓              ↓              ↓
  KPIs      Daily     Vehicle       Pending       Executive
  (4x2)     Chart     Models        Follow-ups    Summary
              ↓
    analyzeConversionFunnel() + analyzeDispositionPatterns() + analyzeTrends() + ...
              ↓
    [Optional: AI Analysis]
    runAiAnalysis() → classifyWithLlm() (via runLlmBatches)
                    → generateVoiceInsights() (single LLM call)
                    → renderCustomerVoice() + renderRecommendations() + ...
```

### Re-Attempt Filter Flow (reattempt_filter.html)
```
User Uploads Multi-Day Zoho Export
              ↓
    parseSheet() → normalize → detect columns
              ↓
    Group by Phone Number → getLatestRow() per group
              ↓
    For each phone group:
    ├── Has Terminal disposition? → EXCLUDE
    ├── Has Connected outcome NOT re-attemptable? → EXCLUDE
    └── Otherwise → INCLUDE in re-attempt list
              ↓
    renderStats() + renderIncludedTable() + renderExcludedTable()
              ↓
    User downloads CSV batches (100 leads per file)
```

### Recording Renamer Flow (recording_renamer.html)
```
User Uploads Processed Sync File (XLSX)
              ↓
    parseDataFile() → read hyperlinks from cells
              ↓
    buildResults() → match phone + date + recording URL
              ↓
    processBatch() → for each row with URL:
      ├── buildFetchUrl() → use CORS proxy or direct
      └── fetchRecordingWithRetry() → download + rename
              ↓
    renderResults() → show progress table
              ↓
    downloadZip() → ZIP all recordings with metadata filenames
```

### Campaign Generator Flow (campaign_generator.html)
```
User Selects Campaign Family (tabs) + Sub-type
              ↓
    User fills form fields (Basic Info, Who/Why, Conversation Flow, Guardrails)
              ↓
    Auto-generated fields update in real-time (UUID, search_term, doc_data, stats)
              ↓
    buildCampaignObjective() → assembles 20-field structured JSON
              ↓
    Preview JSON syntax-highlighted in real-time
              ↓
    User downloads .json or copies to clipboard
```

---

## 🧩 Complete Function Inventory — By File

---

### 1. `index.html` — Landing Page + Auth Gate

**Dependencies**: `config.js`, `assets/scripts/index.js`, `assets/css/index.css`, `assets/fonts/fonts.css`

**Blocking Scripts (in <head>):**
| Script | Purpose |
|--------|---------|
| Theme IIFE | Sets `data-theme` before render |
| Auth redirect | Redirects to `login.html` if no valid `gryd_token` + `gryd_expiry` |

**Tool cards**: Links to all 8 tools (Pre-Sales, Post-Sales, Recording Renamer, Formatter, Campaign Generator, Call Summary, Re-Attempt, Dashboard)

**Connected to** → Links to ALL `pages/*.html` via `<a>` tags + login.html redirect.

---

### 1b. `login.html` / `pages/login.html` — Login Page

**Dependencies**: `config.js` (first script), `assets/styles/login.css`

**Complete Functions** (duplicated identically in both files):
| Function | Purpose | Called By |
|----------|---------|-----------|
| `syncBrandLogo(t)` | Logo swap | Init/theme |
| `applyTheme(t)` | Theme apply | Init/toggleTheme |
| `toggleTheme()` | Dark/light toggle | `onclick` |
| `togglePassword()` | Toggle password visibility | `onclick` on eye button |
| `showError(msg)` | Show error message (auto-dismiss 5s) | handleLogin |
| `setLoading(loading)` | Button loading state | handleLogin |
| `updateSessionInfo()` | Show/hide session expiry | Init/handleLogin |
| `checkSession()` | Check localStorage for valid session | Init |
| `handleLogin()` | POST to gryd backend, store session data | `onclick` on Sign In |
| `handleLogout()` | Clear all gryd localStorage keys | `onclick` |
| `goToDashboard()` | Redirect to index.html | `onclick` |

**Notes**:
- Standalone CSS (`login.css`) has its own theme variables (not using design-system.css)
- Theme functions are inline (not from theme.js)
- Uses `config.js` for `grydEndpoint` and `grydSignupToken`
- Two copies (root and pages/) due to different relative paths to assets

---

### 2. `config.js` — Global Configuration (GITIGNORED)

**Exports**: `window.JEJO_CONFIG`

**Properties**:
| Property | Type | Purpose | Used By |
|----------|------|---------|---------|
| `apiEndpoint` | string | Proxy URL (Cloudflare Worker) | Dashboard, Pre/Post-Sales Sync |
| `proxyHandshakeToken` | string | Auth header for proxy | Dashboard, Pre/Post-Sales Sync |
| `useGrydLlm` | boolean | Use gryd AI backend (true = default) | Dashboard, Pre/Post-Sales Sync |
| `grydEndpoint` | string | Gryd AI backend base URL | All AI pages, login, proxies |
| `grydModel` | string | Model name for gryd (e.g. gcp-gemini-3.1-flash-lite-preview) | All AI pages |
| `grydSignupToken` | string | Auth token for gryd login | login.html, proxy routes |
| `llmBatchSize` | number | Batch size for dashboard AI | Dashboard |
| `llmMaxConcurrent` | number | Concurrent requests | Dashboard |
| `llmMaxRetries` | number | Max retries per batch | Dashboard |
| `llmRequestTimeoutMs` | number | Timeout per request (ms) | Dashboard |
| `llmPromptCharLimit` | number | Max prompt chars | Dashboard |
| `llmMaxOutputTokens` | number | Max output tokens | Dashboard |
| `llmDispositionBatchSize` | number | Batch size for disposition AI | Pre/Post-Sales Sync |
| `llmDispositionMaxConcurrent` | number | Concurrent for disposition | Pre/Post-Sales Sync |
| `llmDispositionTimeoutMs` | number | Timeout for disposition (ms) | Pre/Post-Sales Sync |
| `corsProxyUrl` | string | Recording download proxy | Recording Renamer |

**⚠️ CRITICAL**: Gitignored. When I change `config.example.js`, I must also check if `config.js` exists and needs manual update.

---

### 3. `nav.html` — Shared Navigation (8 links)

**Created at project root.** Injected via fetch into all 8 tool pages.

**Contains**: 8 nav links with SVG icons + auto-activation script. Links:
1. Pre-Sales Sync
2. Post-Sales Sync
3. Re-Attempt Filter
4. Dashboard
5. Call Summary
6. Formatter
7. Campaign Gen (NEW)
8. Recording Renamer

**Injection script** (added to each page's `<div id="navContainer">`):
```html
<script>fetch("../nav.html").then(function(r){return r.text()}).then(function(h){document.getElementById("navContainer").innerHTML=h;});</script>
```

**Auto-activation logic** (inside nav.html):
- Reads `window.location.pathname`
- Sets `class="nav-link active"` + `href="#"` on matching page

**Pages using nav.html**: All 8 tool pages (including `campaign_generator.html`).

Not used by `index.html`, `login.html`, or `pages/login.html`.

---

### 4. `assets/js/lib/llm-batch-runner.js` — AI Batch Engine

**Exported**: `window.runLlmBatches(opts)`

**Internal Functions**:
| Function | Purpose |
|----------|---------|
| `isRetryableStatus(status)` | Returns true for 408, 409, 425, 429, 500, 502, 503, 504, 523, 524 |
| `isClientError(status)` | 4xx non-retryable (throws immediately with nonRetryable flag) |
| `sleep(ms)` | Promise-based setTimeout |
| `jitter(ms)` | Random jitter (75%–125%) |
| `parseRetryAfter(header)` | Parses Retry-After header (supports seconds and HTTP-date) |
| `createThrottleState(initialGap)` | Creates state: `{ gapMs, consecutiveSuccesses, cooldownUntil, initialGap }` |
| `recordSuccess(state)` | After 5 consecutive successes, tightens gap by 70% |
| `recordThrottle(state, retryAfterMs)` | Doubles gap, caps at 5000ms, sets cooldown |
| `isProxyEndpoint(endpoint)` | Returns true if endpoint uses a proxy (defined in ai-config.js) |
| `getConfiguredModel()` | Reads `window.getLlmModel()` → config → gryd model from config |
| `sendBatch(batch, batchIndex)` | Core: retry loop → split-on-failure → half-retry |
| `worker()` | Concurrent worker pulling next batch index |

**Default**:
- `MIN_SPLIT_SIZE = 5` — won't split batches smaller than this

**⚠️ Each page overrides**: `getApiEndpoint()`, `getApiKey()`, `getLlmModel()` are defined inline per HTML file. The SAME llm-batch-runner.js behaves DIFFERENTLY per page.

**Gryd-only**: The engine now uses `grydEndpoint` for all requests. No NVIDIA/OpenRouter fallbacks exist in the codebase.

**Note**: Also exists as a duplicate in `assets/lib/llm-batch-runner.js` (legacy location).

---

### 5. `assets/js/lib/history-helpers.js` — Session History Parser

**Exported Functions** (`window.*`):
| Function | Purpose |
|----------|---------|
| `detectHistory(obj)` | Find history column: checks `history`, `session_history`, `transcript`, `conversation_history`, `chat_history`, `messages` + `__raw` JSON fallback |
| `parseHistoryJson(raw)` | Safely parse JSON string or return array as-is |
| `formatRelativeOffset(firstTs, currentTs)` | `[m:ss]` or `[h:mm:ss]` from epoch ms |
| `normalizeRoleLabel(role)` | `agent/assistant/bot` → `Agent`, `user/customer` → `Customer` |
| `formatHistoryForPrompt(raw)` | Full transcript: `[timestamp] Role: message` lines |

**Used by**: `disposition_sync_v2.html`, `post_sales_disposition.html`

**Note**: Also exists as a duplicate in `assets/lib/history-helpers.js` (legacy location).

---

### 6. `assets/js/lib/ai-config.js` — Shared AI Configuration

**Global variables set**: None (NVIDIA/OpenRouter endpoint constants were removed in June 2026).

**Exported Functions** (`window.*`):
| Function | Purpose |
|----------|---------|
| `getConfigNumber(key, fallback)` | Read number from `JEJO_CONFIG` |
| `isProxyEndpoint()` | Always returns `true` (gryd-only) |
| `hashStr(str)` | Fast non-crypto hash for cache keys |
| `sanitizeForPrompt(text, charLimit)` | Strip control chars, replace double-quotes, redact injection keywords, truncate |

---

### 7. `assets/js/lib/ai-validator.js` — Shared AI Validator

**Exported**: `window.AiValidator`

**StatusBar module**:
| Method | Purpose |
|--------|---------|
| `showStatusBar(total)` | Shows #aiValidationStatus bar, returns AbortSignal |
| `updateStatusBar(done, total, msg, pct, correctedResults)` | Updates batch count, progress, corrections |
| `hideStatusBar(correctedResults, aborted, rerunFn)` | Final state — cancelled vs completed |
| `dismissStatusBar()` | Quick dismiss |
| `cancel()` | Abort current controller |
| `isCancelled()` | Check abort state |
| `getSignal()` | Get AbortSignal |

**Auth helpers**:
| Function | Purpose |
|----------|---------|
| `buildHeaders()` | Generates auth headers with X-Handshake-Token or Bearer |
| `getCachedSessionToken(endpoint)` | Legacy stub — no-op |
| `fetchSessionToken(endpoint)` | GET /session from proxy (legacy) |
| `isRetryableStatus(status)` | Whether status code is retryable |

---

### 8. `assets/js/lib/data-pipeline.js` — Shared Data Pipeline

**Global Functions** (`window.*`):
| Function | Purpose |
|----------|---------|
| `cellToString(val)` | Cell→string, handles scientific notation |
| `normalizePhone(raw)` | Phone→10-digit, handles 91/0 prefix |
| `readFileAsArrayBuffer(file)` | File→ArrayBuffer |
| `parseSheet(ab)` | Excel→row objects with __raw and __rowIndex |
| `esc(value)` / `escapeHtml(value)` | HTML escape |
| `clean(value)` / `lower(value)` | Trim / lowercase |
| `canonicalHeader(h)` / `normalizeHeader(h)` | Header normalization |
| `findCol(row, candidates)` | First non-empty cell from candidates |
| `phoneKey(value)` | Last 10 digits for grouping |
| `isPhoneLike(val)` | Phone pattern check |
| `excelSafe(v)` / `excelSafeCsvCell(v)` / `excelSafeTsvCell(v)` | Formula injection protection (re-exports from excel-safe.js) |
| `rowsToTsv(rows, keys)` | Rows→tab-separated text |

---

### 9. `assets/js/lib/date-utils.js` — Shared Date Utilities

**Global Functions** (`window.*`):
| Function | Purpose |
|----------|---------|
| `detectDateFormat(dateStrings)` | Auto-detect DMY vs MDY |
| `updateDateParserNote()` | UI note for current format |
| `handleDateFormatChange(onFormatChange)` | Read select, update `dateParseOrder` |
| `applyDateFormat(getDateStrings)` | Auto-detect or set `dateParseOrder` |
| `parseExcelSerialDate(value)` | Excel serial→Date |
| `buildValidatedDate(year, month, day, h, m, s)` | Validated Date constructor |
| `parseDate(value)` | Multi-format date parser |
| `formatDateDisplay(date)` | DD/MM/YYYY |
| `formatDateToken(date)` | "1Jan" style token |
| `formatSerialDate(val)` | Serial→DD/MM/YYYY |
| `MONTH_NAMES` | Array of month names |

---

### 10. `assets/js/lib/excel-safe.js` — Formula Injection Protection

**Global Functions** (`window.*`):
| Function | Purpose |
|----------|---------|
| `excelSafe(v)` | Prefix `=` `+` `-` `@` with `'` |
| `excelSafeCsvCell(v)` | CSV-safe with quoting |
| `excelSafeTsvCell(v)` | TSV-safe with tab/newline stripping |

---

### 11. `assets/js/lib/batch-export.js` — Batch Export System

**Class**: `window.BatchExporter`

**Methods**:
| Method | Purpose |
|--------|---------|
| `constructor(prefix)` | Sets up key `jejo-ae-batch-export-{prefix}` |
| `createFingerprint(file, rowCount)` | Unique file identity |
| `readStore()` | Read localStorage |
| `writeStore(store)` | Write localStorage (with error handling) |
| `getSavedProgress(fp, templateId, inputRowCount)` | Resume point |
| `saveProgress(fp, templateId, inputRowCount, nextLeadIndex)` | Save progress |
| `clearProgressForFingerprint(fp)` | Clear progress |

**Migrates old shared key** `jejo-ae-batch-export-v1` on first constructor call.

---

### 12. `assets/js/lib/theme.js` — Shared Theme Management

**Global Functions** (`window.*`):
| Function | Purpose |
|----------|---------|
| `getStoredTheme()` | `localStorage.getItem('jejo-theme')` or `'dark'` |
| `syncBrandLogo(theme)` | Swap brand mark image |
| `applyTheme(theme)` | Set `data-theme`, localStorage, logo |
| `toggleTheme()` | Toggle dark/light |

---

### 13. `worker/worker.js` — Production Proxy (Cloudflare Worker)

**Env vars**: `NVIDIA_API_KEY`, `HANDSHAKE_TOKEN`, `UPSTREAM_TIMEOUT_MS`

**Routes**:
| Route | Purpose |
|-------|---------|
| `OPTIONS *` | CORS preflight (204) |
| `GET /health` | Health check |
| `POST /gryd/*` | Proxy to gryd backend (30s timeout) |
| `POST *` | Forward to NVIDIA with Bearer auth |

**Gryd proxy behavior**:
- Strips browser `Origin` header
- Forwards: `x-gryd-enterprise-id`, `x-gryd-token`, `x-gryd-session-id`, `x-gryd-signup-token`, `x-gryd-application-id`
- 30s timeout, 504 on timeout, 502 on error

**Security**:
- Handshake token validation (if `HANDSHAKE_TOKEN` env is set)
- Rate limiting: 1000 req/min per IP
- 1 MB body size limit (checked via Content-Length + actual body)

---

### 14. `server/proxy.js` — Local Dev Proxy (Node.js)

**Env vars** (from `.env`): `NVIDIA_API_KEY`, `PORT` (default 3456), `HANDSHAKE_TOKEN`, `UPSTREAM_TIMEOUT_MS`, `ALLOWED_ORIGINS`, `CORS_ORIGIN`

**Routes**:
| Route | Purpose |
|-------|---------|
| `OPTIONS *` | CORS preflight (204) |
| `GET /health` | Health check |
| `GET /session` | Create session token (5 min TTL) |
| `POST /gryd/*` | Proxy to gryd backend |
| `POST /v1/chat/completions` | Proxy to NVIDIA API |

**Gryd proxy**: Same behavior as worker. Forwards gryd-specific headers, strips browser Origin. 30s timeout.

**Session auth**: `X-Session-Token` header required for `/v1/chat/completions`. Token obtained via `GET /session`.

**Running**: `cd server && npm start` (port 3456)

**CORS headers**: Configurable via `ALLOWED_ORIGINS` env var. Default: `http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080`.

---

### 15. `pages/disposition_sync_v2.html` — Pre-Sales Sync

**Count**: ~88 functions. (Full inventory preserved from earlier versions — see complete table in previous doc revision.)

**Known bugs**:
- `btnValidateAI.onclick` is rebound in 2 places: force=true and force=false
- Brace pattern `} else { {` was found and recently fixed
- Cache write was scoped incorrectly (recently fixed)

---

### 16. `pages/post_sales_disposition.html` — Post-Sales Sync

**Count**: ~85 functions. (Full inventory preserved from earlier versions.)

**Known bugs**:
- `btnValidateAI.onclick` is rebound in 3 places depending on state
- Loads config.js LAST — if anything depends on `window.JEJO_CONFIG` at parse time, it will fail

---

### 17. `pages/dashboard.html` — Campaign Dashboard

**Count**: ~65 functions. (Full inventory preserved from earlier versions.)

**Unique Features**:
- Own complete AI pipeline (`classifyWithLlm`) — separate from disposition sync
- Uses `llmThemeBatchSize` (separate from `llmBatchSize`)
- PDF export with html2canvas + jspdf
- `DISPO_TO_THEME` mapping for internal theme classification

---

### 18. `pages/call_analysis_summary.html` — Call Analysis Summary

**Count**: ~58 functions. (Full inventory preserved from earlier versions.)

**Note**: `config.js` is loaded but **appears unused** — no AI calls in this page.

---

### 19. `pages/reattempt_filter.html` — Re-Attempt Filter

**Count**: ~57 functions. (Full inventory preserved from earlier versions.)

**Shared Batch System**: Uses `BatchExporter` class with prefix `'reattempt'`.

---

### 20. `pages/autongage_formatter.html` — AutoEngage Formatter

**Count**: ~35 functions. (Full inventory preserved from earlier versions.)

**Key Data**: 9 templates (Bullmenn, Ambal ERODE, Ambal SAIBABA, Suryabala, ICARE, Anant Cars, Singhal, Fortune Hyryder, Fortune Toyota).

**Shared Batch System**: Uses `BatchExporter` class with prefix `'formatter'`.

---

### 21. `pages/recording_renamer.html` — Recording Renamer

**Count**: ~46 functions. (Full inventory preserved from earlier versions.)

**Security limits**: `RECORDING_MAX_COUNT=100`, `RECORDING_MAX_BYTES_PER_FILE=50MB`, `RECORDING_MAX_TOTAL_BYTES=500MB`.

---

### 22. `pages/campaign_generator.html` — Campaign Objective Generator (NEW)

**Scripts**: **NO external JS libs** — all inline. **NO config.js**. **NO design-system.css**. Has its own CSS (`campaign-generator.css`) with static theme variables.

**Key Data**:
- `CAMPAIGN_FAMILIES` — 3 families:
  - `presales_voice` (Test Drive Booking): 3 sub-types (TDB Outbound, Follow-up, Re-engagement) + 3 extra fields
  - `service_voice` (Service Reminder): 3 sub-types (Due, Overdue, Feedback) + 3 extra fields
  - `whatsapp` (WhatsApp Template): 3 sub-types (Promotional, Service Reminder, Feedback) + 4 extra fields + field label overrides
- `allFieldKeys` — 22 tracked fields

**Complete Function Inventory** (~25 functions):

| # | Function | Purpose | Called By |
|---|----------|---------|-----------|
| 1 | `init()` | Bootstrap rendering | `init()` on load |
| 2 | `renderFamilyTabs()` | Campaign family tab buttons | init() / onTabClick() |
| 3 | `populateSubTypes()` | Sub-type select options | init() / onTabClick() |
| 4 | `renderExtraFields()` | Family-specific fields | init() / onTabClick() |
| 5 | `onTabClick(familyId)` | Tab switching | onclick on tabs |
| 6 | `updateFieldLabels()` | Dynamic labels for WhatsApp mode | onTabClick() |
| 7 | `getStoredValue(key)` | Read form value | Multi |
| 8 | `onFormChange()` | Trigger re-render | oninput on all fields |
| 9 | `buildCampaignObjective()` | Assemble full 20-field JSON | updateAll() |
| 10 | `buildSearchTerm(fam, subType)` | Auto-generated search term | buildCampaignObjective() |
| 11 | `parseFilterParams()` | Parse JSON filter params | buildCampaignObjective() |
| 12 | `generateUUID()` | UUID v4 | buildCampaignObjective() |
| 13 | `updateAll()` | Re-render everything | onFormChange() |
| 14 | `renderAutoFields(obj)` | Auto-generated field display | updateAll() |
| 15 | `updateStats(obj)` | Field count/filled/percentage | updateAll() |
| 16 | `renderPreview(obj)` | Syntax-highlighted JSON | updateAll() |
| 17 | `syntaxHighlight(json)` | JSON coloring | renderPreview() |
| 18 | `downloadJSON()` | Download .json file | onclick |
| 19 | `copyJSON()` | Copy to clipboard | onclick |
| 20 | `clearForm()` | Reset all fields | onclick |
| 21 | `setStatus(msg, type)` | Status message | Multi |
| 22 | `showToast(msg)` | Toast notification | copyJSON() |
| 23 | `escapeHtml(value)` | HTML sanitize | Rendering helpers |
| 24 | `syncBrandLogo(theme)` | Logo swap | Theme |
| 25 | `applyTheme(theme)` | Theme apply | Theme |
| 26 | `toggleTheme()` | Toggle | onclick |

**CSS**: Standalone file (`campaign-generator.css`) with cyan accent (`#06b6d4`). Has its own theme variables in `:root` + `[data-theme="light"]`. Features: family tabs, form grids, auto-fields, JSON syntax highlighting, stats bar, toast, responsive breakpoints.

---

## ⚠️ Danger Zones — Change Ripple Effects

### If I change `config.js` → affects:
- `dashboard.html` (AI config: batchSize, concurrent, timeout, model)
- `disposition_sync_v2.html` (AI config: llmDispositionBatchSize etc.)
- `post_sales_disposition.html` (AI config)
- `recording_renamer.html` (corsProxyUrl)
- `login.html` + `pages/login.html` (grydEndpoint, grydSignupToken)
- `call_analysis_summary.html` (loaded but unused — no effect)

### If I change `llm-batch-runner.js` → affects:
- `dashboard.html` → `classifyWithLlm()` uses `runLlmBatches()`
- `disposition_sync_v2.html` → `validateDispositionsWithLLM()` uses `runLlmBatches()`
- `post_sales_disposition.html` → `validateDispositionsWithLLM()` uses `runLlmBatches()`

### If I change `history-helpers.js` → affects:
- `disposition_sync_v2.html` → `detectHistory()`, `formatHistoryForPrompt()`
- `post_sales_disposition.html` → `detectHistory()`, `formatHistoryForPrompt()`

### If I change theme functions → affects:
- `assets/js/lib/theme.js` — all 8 main pages
- `login.html`, `pages/login.html`, `pages/campaign_generator.html` — inline duplicates

### If I change batch export system (`BatchExporter` class) → affects:
- `reattempt_filter.html` (prefix: `'reattempt'`) and `autongage_formatter.html` (prefix: `'formatter'`)

### If I change `assets/css/design-system.css` → affects:
- ALL 7 tool pages (shared theme vars, reset, header/nav, theme-toggle, buttons, status bars)
- `index.html` is NOT affected (different design)
- `campaign_generator.html` is NOT affected (standalone CSS)
- `login.html` / `pages/login.html` are NOT affected (standalone CSS)

### If I change page-specific CSS variables → affects:
- Only the single CSS file for that page

### If I change `docs/disposition.md` → affects:
- `post_sales_disposition.html` — OUTPUT_SCHEMAS mirror this doc
- `call_analysis_summary.html` — disposition lists
- `dashboard.html` — DISPO_TO_THEME mapping

### If I change `docs/AN_format.md` → affects:
- `autongage_formatter.html` — template definitions mirror this doc

### If I change `nav.html` → affects:
- All 8 tool pages (nav is injected via fetch) — 1 source of truth

### If I change `worker/worker.js` or `server/proxy.js` gryd proxy routes → affects:
- `login.html` / `pages/login.html` — login flow depends on `/gryd/login` endpoint
- `config.js` — `grydEndpoint` must match

---

## 🧠 CSS Architecture

### Design System (`assets/css/design-system.css`)

All 7 main tool pages share a single design system loaded FIRST, then overridden by page-specific CSS.

**What the design system provides**:
- Theme tokens (dark/light) — `--bg`, `--surface`, `--accent`, `--text`, etc.
- Reset & base (`*`, `html`, `body`)
- Header, nav links, brand-mark, header-badge, theme-toggle
- Status messages (`.status-msg`)
- Drop zone (`.drop-zone`, `.dz-icon`, `.dz-text`, `.dz-status`)
- `.btn-generate` CTA button
- AI status bar (`.ai-status-bar`, `.ai-status-msg`, `.ai-status-badge`, etc.)
- Processing overlay (`.processing-overlay`, `.processing-msg`)

**How theming works**: Each page defines its accent color in `:root { --accent: ... }`, which cascades through the design system's `var(--accent, #eab308)` fallbacks.

### Standalone CSS Pages (NOT using design-system.css)

| CSS File | Used By | Accent | Notes |
|----------|---------|--------|-------|
| `index.css` | Landing page | Red (#ef4444) | Full custom design |
| `login.css` | Login pages | Yellow (#eab308) | Grid bg, glass card, password toggle |
| `campaign-generator.css` | Campaign Generator | Cyan (#06b6d4) | Form tabs, JSON preview, stats bar, responsive |

These 3 have their OWN theme variables defined directly in `:root` and `[data-theme="light"]`.

### Per-Page CSS Overrides (use design-system.css)

| CSS File | Used By | Accent Color | Unique Content |
|----------|---------|-------------|----------------|
| `dashboard.css` | Campaign Dashboard | Yellow (#eab308) | KPI cards, bar charts, voice cards, PDF styles |
| `call-analysis-summary.css` | Call Summary | Purple (#a855f7) | KPI tables, preview tables |
| `disposition-sync-v2.css` | Pre-Sales Sync | Red (#ef4444) | Quality report, step pills, session table |
| `post-sales-disposition.css` | Post-Sales Sync | Orange (#f97316) | Preview tables, dealer selects |
| `reattempt-filter.css` | Re-Attempt Filter | Pink (#f472b6) | Batch export panel, included/excluded tables |
| `recording-renamer.css` | Recording Renamer | Green (#22c55e) | Progress table, zip status |
| `autongage-formatter.css` | AutoEngage Formatter | Blue (#3b82f6) | Mapping audit, batch export panel |

---

## 📋 Summary: Which Pages Use AI (LLM) vs Not

| Page | Uses AI? | AI Engine | Uses config.js? |
|------|----------|-----------|-----------------|
| `dashboard.html` | ✅ Yes | `llm-batch-runner.js` + own classifyWithLlm | ✅ Yes |
| `disposition_sync_v2.html` | ✅ Yes | `llm-batch-runner.js` | ✅ Yes |
| `post_sales_disposition.html` | ✅ Yes | `llm-batch-runner.js` | ✅ Yes |
| `call_analysis_summary.html` | ❌ No | — | ✅ (loaded but unused) |
| `reattempt_filter.html` | ❌ No | — | ❌ No |
| `autongage_formatter.html` | ❌ No | — | ❌ No |
| `recording_renamer.html` | ❌ No | — | ✅ Yes (for corsProxyUrl) |
| `campaign_generator.html` | ❌ No | — | ❌ No |
| `login.html` / `pages/login.html` | ❌ No | — | ✅ Yes (for grydEndpoint + grydSignupToken) |

---

## 📋 File Dependency Graph

```
index.html ──────────────────────────────────────→ pages/*.html (links via <a>)
          └── login.html → root login redirect (auth gate)

login.html ←── config.js (grydEndpoint, grydSignupToken)
pages/login.html ←── config.js (grydEndpoint, grydSignupToken)

config.js ←── dashboard.html
         ←── disposition_sync_v2.html
         ←── post_sales_disposition.html
         ←── recording_renamer.html
         ←── login.html / pages/login.html
         (loaded but unused by call_analysis_summary.html)
         (NOT loaded by reattempt_filter.html, autongage_formatter.html, campaign_generator.html)

llm-batch-runner.js ←── dashboard.html
                    ←── disposition_sync_v2.html
                    ←── post_sales_disposition.html

history-helpers.js ←── disposition_sync_v2.html
                    ←── post_sales_disposition.html

excel-safe.js ←── reattempt_filter.html
             ←── autongage_formatter.html
             ←── recording_renamer.html
             ←── post_sales_disposition.html
             ←── disposition_sync_v2.html

data-pipeline.js ←── ALL 7 tool pages (except campaign_generator)
date-utils.js    ←── Pages with date handling
ai-config.js     ←── All 3 AI pages
ai-validator.js  ←── All 3 AI pages
theme.js         ←── ALL 8 main pages (not login or campaign_generator)
batch-export.js  ←── reattempt_filter.html + autongage_formatter.html

xlsx.full.min.js ←── ALL tools
jszip.min.js     ←── recording_renamer.html only
html2canvas      ←── dashboard.html only
jspdf            ←── dashboard.html only

worker/worker.js ←── config.js (apiEndpoint URL) + gryd proxy routes
server/proxy.js  ←── config.js (apiEndpoint URL) + gryd proxy routes
```

---

## 🧠 Graphify Knowledge Graph

> Generated on 2026-06-12 via `graphify update .` (code-only AST extraction, no LLM).
> Built from commit `5b2ca217`.

**31 files · ~115K words · 554 nodes · 710 edges · 53 communities**

### Top God Nodes (most connected — core abstractions)

| Rank | Node | Edges | Role |
|------|------|-------|------|
| 1 | `🧩 Complete Function Inventory — By File` | 24 | Cross-community bridge (Community 7 ↔ 2) |
| 2 | `🔧 Common Bugs & Fixes Log` | 13 | Historical knowledge hub |
| 3 | `🏗️ AutoNage Architecture — File-by-File Reference` (this doc) | 12 | Cross-community bridge (Community 2 ↔ 7) |
| 4 | `⚠️ Danger Zones — Change Ripple Effects` | 12 | Dependency ripple-effect map |
| 5 | `🧠 Buffy's Memory File` | 10 | Agent memory |
| 6 | `AutoEngage Field Mapping Reference` | 9 | Field mapping docs |
| 7–8 | `_()` (×2) | 36 each | Large inline script blobs (vendored/minified JS) |
| 9–10 | `m()` (×2) | 12 each | Large inline script blobs (vendored/minified JS) |

### Key Communities

| Community | Cohesion | Nodes | What's In It |
|-----------|----------|-------|-------------|
| **#2** | 0.06 | 34 | **Architecture & Docs** — This architecture doc, CSS architecture, data flow diagrams, file dependency graph, campaign generator flow, dashboard flow, design system reference |
| **#5** | 0.06 | 31 | **Bug Log & History** — Bug fixes log entries, temp file cleanup, gryd login system note, campaign generator note |
| **#6** | 0.07 | 26 | **Campaign Templates** — Real-world dealership campaigns (Bullmenn, Ambal ERODE, Ambal SAIBABA, SURYABALA, ICARE, Anant Cars, Fortune Hyryder, Fortune Toyota, etc.) |
| **#7** | 0.08 | 24 | **Runtime Core** — All shared libs (excel-safe.js, batch-export.js, theme.js), proxy files (worker/worker.js, server/proxy.js), 3 AI pages (disposition_sync_v2, post_sales_disposition, dashboard), nav.html |
| **#10** | 0.12 | 8 | **Rate Limiting** — `buildHeaders()`, `fetchSessionToken()`, `isProxyEndpoint()`, `checkRateLimit()`, `corsHeaders`, `fetch()`, `jsonResponse()`, `rateLimitMap` |
| **#11** | 0.12 | 11 | **Server Proxy** — `ALLOWED_ORIGINS`, `CORS_HEADERS`, `createSession()`, `__dirname`, `env`, `generateSessionToken()`, `PORT`, `rateLimitMap` |
| **#14** | 0.20 | 4 | **LLM Batch Runner** — `createThrottleState()`, `isClientError()`, `isRetryableStatus()`, `runLlmBatches()` (tightest utility cluster) |
| **#16** | 0.18 | 10 | **Deployment Docs** — Cloudflare Worker setup, environment variables, config.js update steps |
| **#18/19** | 0.60 | 3 each | **Theme Functions** — `applyTheme()`, `syncBrandLogo()`, `toggleTheme()` (highest cohesion, appears twice due to inline duplicates) |

### Surprising Connections

- `fetchSessionToken()` in `assets/js/lib/ai-validator.js` —calls→ `fetch()` in `worker/worker.js` (INFERRED edge, confidence 0.8)

This means `ai-validator.js`'s legacy session token fetch directly references the production worker endpoint, not just the local dev proxy.

### Import Cycles

**None detected** — the dependency graph is acyclic. Good architecture.

### Knowledge Gaps

- **141 isolated nodes** (≤1 connection) — mostly npm package metadata (`name`, `version`, `description`, `engines`, `main`, `scripts`) that graphify extracted from `package.json` but couldn't connect to the rest of the graph. This is expected noise.
- **11 thin communities** omitted from report (<3 nodes).
- Community 2 has **low cohesion (0.06)** — the architecture/docs cluster is weakly interconnected, suggesting documentation could be better cross-linked.

### How to Regenerate

```bash
# Code-only update (no LLM key needed):
python -m graphify update .

# With LLM semantic naming (set GEMINI_API_KEY first):
python -m graphify cluster-only . --backend gemini
```

---

## 💡 Key Insights from This Analysis

1. **Most duplicated code**: Theme functions (3 standalone pages with inline duplicates)
2. **Most fragile pattern**: `btnValidateAI.onclick` rebound in multiple places (3 in post_sales, 2 in pre_sales)
3. **Best candidates for refactoring**: Extract inline theme functions from login pages and campaign_generator into theme.js
4. **Dead code**: `call_analysis_summary.html` loads `config.js` but never uses it
5. **Hidden coupling**: `reattempt_filter.html` and `autongage_formatter.html` share the `BatchExporter` class with different prefixes
6. **Standalone CSS pages**: `index.css`, `login.css`, `campaign-generator.css` — each has its own theme variables, making theme changes require touching 3 separate files
7. **Duplicate lib files**: `assets/lib/llm-batch-runner.js` and `assets/lib/history-helpers.js` are duplicates of `assets/js/lib/` versions
8. **Gryd-only migration complete**: NVIDIA/OpenRouter API keys, endpoints, and key management UI removed across all pages. 3 cosmetic `'nvidia'` engine label strings remain in dashboard.html (non-functional).
