# AutoNage NVIDIA Proxy — Cloudflare Worker

## Why you need this

Your office network blocks `integrate.api.nvidia.com`. This Worker runs on
Cloudflare's infrastructure (not your network), so it CAN reach the NVIDIA API.
Your team's browsers talk to the Worker, and the Worker talks to NVIDIA.

## How it works

```
Browser ──POST──> worker.url/v1/chat/completions ──POST──> NVIDIA API
     <── CORS + response ──────────────────────────────────<── response ──
```

- The NVIDIA API key lives **only** in the Worker — never exposed to browsers
- The handshake token prevents unauthorized use
- CORS headers allow your dashboard to call it cross-origin

---

## Deployment — Step by Step

### Step 1: Create Cloudflare account

Go to https://dash.cloudflare.com and sign up (free tier is plenty).

### Step 2: Create the Worker

1. Click **Workers & Pages** in the left sidebar
2. Click **Create application** → **Create Worker**
3. Give it a name like `autonage-nvidia-proxy`
4. Replace the default code with the contents of `worker.js` (below)
5. Click **Save and Deploy**

### Step 3: Add environment variables

In the Worker editor:

1. Go to **Settings** → **Variables**
2. Add these two **Secrets** (not plain text):

| Variable Name | Value |
|---|---|
| `NVIDIA_API_KEY` | `nvapi-your-key-here` |
| `HANDSHAKE_TOKEN` | `your-secret-token-here` |

3. Click **Save**

> **Important:** The `HANDSHAKE_TOKEN` must match what's in your `config.js`
> `proxyHandshakeToken` field. Pick a long random string.

### Step 4: Get your Worker URL

Copy the URL shown at the top of the Worker page, e.g.:
```
https://autonage-nvidia-proxy.your-subdomain.workers.dev
```

### Step 5: Update config.js

Edit `config.js` in this project:

```js
apiEndpoint: "https://autonage-nvidia-proxy.your-subdomain.workers.dev",
proxyHandshakeToken: "your-secret-token-here",
```

---

## Testing

Once deployed, test the health endpoint in your browser:

```
https://autonage-nvidia-proxy.your-subdomain.workers.dev/health
```

You should see: `{"status":"ok","proxy":"autonage-cloudflare"}`

Then open your dashboard, hard refresh (`Ctrl+Shift+R`), and click Generate.
