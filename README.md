# AutoNage — Lead Operations Automation

A suite of browser-based tools for automotive lead operations. Each tool is a self-contained HTML file with no backend dependencies — everything runs locally in the browser. All external resources (fonts, JavaScript libraries) are self-hosted for offline use and security compliance.

---

## Project Structure

```
.
├── index.html                          # Landing page + auth gate
├── login.html                          # Standalone login page (root)
├── config.js                           # API keys, gryd settings (gitignored)
├── config.example.js                   # Config template with instructions
├── nav.html                            # Shared navigation (injected via fetch into all tools)
├── .gitignore
├── test-data.csv                       # Sample test data
├── README.md                           # This file
│
├── pages/                              # Tool HTML files
│   ├── login.html                      # Login page (for pages/ context)
│   ├── disposition_sync_v2.html        # Pre-Sales Sync
│   ├── post_sales_disposition.html     # Post-Sales Sync
│   ├── recording_renamer.html          # Recording Renamer
│   ├── autongage_formatter.html        # AutoEngage Formatter
│   ├── call_analysis_summary.html      # Call Analysis Summary
│   ├── reattempt_filter.html           # Re-Attempt Filter
│   ├── campaign_generator.html         # Campaign Objective Generator
│   └── dashboard.html                  # Campaign Dashboard
│
├── assets/
│   ├── fonts/                          # Self-hosted web fonts
│   │   ├── fonts.css                   #   @font-face declarations
│   │   └── *.woff2                     #   Inter, Manrope, IBM Plex Mono
│   ├── images/
│   │   ├── AN.png                      #   Light mode logo
│   │   └── AN Dark.png                 #   Dark mode logo
│   ├── js/
│   │   ├── init.js                     # Theme + auth gate IIFE
│   │   ├── nav-init.js                 # nav.html loader
│   │   ├── vendor/                     # Third-party libs
│   │   │   ├── xlsx.full.min.js        #   SheetJS — Excel parsing
│   │   │   ├── jszip.min.js            #   JSZip — ZIP compression
│   │   │   ├── html2canvas.min.js      #   Screenshot capture
│   │   │   └── jspdf.umd.min.js        #   jsPDF — PDF generation
│   │   └── lib/                        # First-party shared libraries
│   │       ├── theme.js                #   Dark/light theme toggle
│   │       ├── ai-config.js            #   AI endpoint, model, sanitizer
│   │       ├── ai-validator.js         #   AI status bar + validation pipeline
│   │       ├── llm-batch-runner.js     #   AI batch processing engine
│   │       ├── history-helpers.js      #   Session transcript parsing
│   │       ├── data-pipeline.js        #   CSV/Excel parsing, phone normalization
│   │       ├── date-utils.js           #   Multi-format date parser
│   │       ├── excel-safe.js           #   Formula injection protection
│   │       └── batch-export.js         #   Batch export with prefix isolation
│   └── styles/
│       ├── index.css                   # Landing page (standalone)
│       ├── login.css                   # Login page (standalone)
│       ├── campaign-generator.css      # Campaign Gen (standalone, cyan accent)
│       ├── design-system.css           # Shared design system (7 tool pages)
│       ├── dashboard.css               # Yellow accent
│       ├── disposition-sync-v2.css     # Red accent
│       ├── post-sales-disposition.css  # Orange accent
│       ├── call-analysis-summary.css   # Purple accent
│       ├── reattempt-filter.css        # Pink accent
│       ├── autongage-formatter.css     # Blue accent
│       └── recording-renamer.css       # Green accent
│
├── server/
│   ├── proxy.js                        # Local Node.js dev proxy
│   └── package.json
│
├── worker/
│   ├── worker.js                       # Cloudflare Worker (production proxy)
│   └── README.md
│
├── docs/
│   ├── AN_format.md                    # AutoEngage format reference
│   ├── architecture.md                 # Full architecture map
│   ├── disposition.md                  # Disposition definitions
│   └── freebuff.md                     # AI agent memory file
│
└── graphify-out/                       # AST graph files (generated)
```

---

## Tools Overview

| Page | Purpose |
|---|---|
| **dashboard.html** | Campaign performance dashboard with KPIs, charts, and data overview |
| **call_analysis_summary.html** | Call analysis summary with connected/disconnected stats and KPIs |
| **disposition_sync_v2.html** | Pre-Sales Sync — merges AutoEngage exports into Zoho Master Sheet format |
| **post_sales_disposition.html** | Post-Sales Disposition — service campaign sync and AI validation |
| **campaign_generator.html** | Generate 20-field structured campaign JSONs |
| **recording_renamer.html** | Bulk rename call recording files with campaign metadata |
| **reattempt_filter.html** | Filter and manage re-attempt leads for call campaigns |
| **autongage_formatter.html** | Client file → AutoEngage upload format with column mapping |

---

## Getting Started

### 1. Authentication

The project now uses **gryd AI backend** for authentication:

1. Open `index.html` in a browser
2. If no valid session is found, you'll be redirected to `login.html`
3. Enter your credentials (email/password provided by your deployment team)
4. Session persists in `sessionStorage` with expiry info displayed on the login page

### 2. Configuration

Copy `config.example.js` to `config.js` and configure:

```js
window.JEJO_CONFIG = {
  // Gryd AI backend
  grydEndpoint: "http://localhost:3456",
  grydModel: "gcp-gemini-3.1-flash-lite-preview",
  grydSignupToken: "",                    // From your admin portal
  useGrydLlm: true,

  // Proxy endpoint (Cloudflare Worker or Node.js)
  apiEndpoint: "https://your-worker.workers.dev",
  proxyHandshakeToken: "your-token",

  // LLM tuning
  llmBatchSize: 12,
  llmMaxConcurrent: 2,
  llmMaxRetries: 3,
  llmRequestTimeoutMs: 120000,

  // CORS proxy for recording downloads
  corsProxyUrl: ""
};
```

**Note:** `config.js` is gitignored and should never be committed. Only `config.example.js` is tracked.

### 3. Run Locally

```bash
# Start the local dev proxy (for AI calls + auth):
cd server && npm start
# (port 3456 — needs .env file with credentials)
```

Then open `index.html` (or any `pages/*.html`) directly in a browser, or serve via any static server.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | HTML + CSS (no framework) |
| Logic | Vanilla JavaScript (ES6+) |
| File parsing | SheetJS (XLSX.js) — self-hosted |
| PDF generation | jsPDF + html2canvas — self-hosted |
| Fonts | Inter, Manrope, IBM Plex Mono — self-hosted |
| AI backend | Gryd AI (via Cloudflare Worker or local proxy) |
| Auth | Gryd session-based (JWT tokens) |
| Hosting | Static file serving (CloudFront / S3 / any web server) |

---

## Deployment

The project is designed to be deployed as a static site to any web server or CDN.

### CloudFront (AWS)

1. Upload all files to an S3 bucket (keep the directory structure intact)
2. Point CloudFront distribution to the S3 bucket
3. Add a **Response Headers Policy** for security headers:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |

4. Set **Security Policy** to `TLSv1.2_2023` (disables TLS 1.0/1.1 and weak ciphers)

### Cloudflare Worker

Deploy `worker/worker.js` as a Cloudflare Worker with environment variables for AI proxy + gryd login routes.

### Security

- All external scripts and fonts are self-hosted (zero CDN dependencies)
- Content Security Policy (CSP) enforced via `<meta>` tag — `connect-src` allows only configured endpoints
- `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` set as meta tags and HTTP headers
- Inline scripts allowed (`'unsafe-inline'`) — necessary for self-contained HTML tools

---

## Development

All tools are single-file HTML documents in `pages/`. To modify:

1. Edit the relevant `pages/*.html` file
2. Open it directly in a browser to test
3. No build step, no bundler, no npm install needed

### Adding a New Tool

1. Create a new HTML file in `pages/`
2. Add a link in `index.html` with `href="pages/your-tool.html"`
3. Add a link in `nav.html` for persistent navigation
4. Reference assets with `../assets/` prefix (e.g., `../assets/fonts/fonts.css`)

### Key Conventions

- **Theme**: Uses `data-theme` attribute with `localStorage('jejo-theme')` key
- **Auth**: Pages check `sessionStorage.getItem('gryd_token')` + expiry
- **Shared nav**: `nav.html` injected via `fetch()` into `<div id="navContainer">`
- **AI calls**: Use `runLlmBatches()` from `llm-batch-runner.js` for batched processing
- **File I/O**: Use `XLSX` library for spreadsheet reading/writing

---

## License

Internal use — AutoNage Lead Operations Automation

*JEJO — Lead Operations Automation*
