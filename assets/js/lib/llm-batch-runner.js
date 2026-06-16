/**
 * NVIDIA API Batch Runner — shared adaptive scheduler for all AutoNage tools.
 *
 * Replaces:
 *  - Fixed 2s sleep between batches (pre-sales / post-sales sync)
 *  - Unbounded burst concurrency (dashboard)
 *
 * Behaviour
 *  - Splits items into configurable batches
 *  - Runs up to `maxConcurrent` in-flight requests
 *  - Launches each request with a `minGapMs` spacing
 *  - Retries transient failures (408, 429, 5xx, timeouts) with exponential backoff
 *  - On 429: respects Retry-After header, temporarily throttles down
 *  - After several healthy responses: gradually recovers to normal speed
 *  - Returns ordered results (same order as input items)
 *
 * Usage
 *  runLlmBatches({
 *    items,               // array of candidate objects
 *    batchSize: 10,       // items per API request
 *    maxConcurrent: 2,    // how many requests at once
 *    minGapMs: 300,       // minimum ms between request starts
 *    maxRetries: 3,       // retries per batch before giving up
 *    requestTimeoutMs: 60000,
 *    getCacheKey,         // (items) => string | null
 *    cachedData,          // previously cached result (skip API if valid)
 *    buildPrompt,         // (batch, batchIndex) => { system, user, temperature?, maxTokens?, maxCompletionTokens? }
     *    //   temperature defaults to 0.7 when undefined; maxTokens/maxCompletionTokens fallback to 8192 when neither is provided
 *    buildHeaders,        // () => object (optional, default uses NVIDIA auth)
 *    parseResponse,       // (text, batch) => array of per-item results
 *    onProgress,          // (done, total, message, pct) => void
 *    signal               // AbortSignal (optional)
 *  })
 *  => { results: Map<itemIndex, parsedResult>, correctedCount: number, failedBatches: number[] }
 */
(function () {
  if (typeof window !== 'undefined' && window.runLlmBatches) return;

  var MIN_SPLIT_SIZE = 5;  // When a batch fails, split into halves until this size

  // ── helpers ──────────────────────────────────────────────────────────────
  function isRetryableStatus(status) {
    return status === 408 || status === 409 || status === 425 ||
           status === 429 || status === 500 || status === 502 ||
           status === 503 || status === 504 || status === 523 ||
           status === 524;
  }

  function isClientError(status) {
    return status >= 400 && status < 500 && !isRetryableStatus(status);
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function jitter(ms) {
    return ms * (0.75 + Math.random() * 0.5);
  }

  // Extract Retry-After (seconds). Supports both seconds integer and HTTP-date.
  function parseRetryAfter(header) {
    if (!header) return null;
    var val = Number(header);
    if (Number.isFinite(val) && val > 0) return val * 1000;
    var d = new Date(header);
    if (!isNaN(d.getTime())) return Math.max(0, d.getTime() - Date.now());
    return null;
  }

  // ── state machine ────────────────────────────────────────────────────────
  function createThrottleState(initialGap) {
    return {
      gapMs: initialGap,
      consecutiveSuccesses: 0,
      cooldownUntil: 0,
      initialGap: initialGap
    };
  }

  function recordSuccess(state) {
    state.consecutiveSuccesses++;
    // After 5 consecutive successes, tighten gap back toward initial
    if (state.consecutiveSuccesses >= 5 && state.gapMs > state.initialGap) {
      state.gapMs = Math.max(state.initialGap, Math.round(state.gapMs * 0.7));
    }
  }

  function recordThrottle(state, retryAfterMs) {
    state.consecutiveSuccesses = 0;
    state.gapMs = Math.min(5000, Math.round(state.gapMs * 2));
    state.cooldownUntil = Date.now() + (retryAfterMs || state.gapMs);
  }

  function isProxyEndpoint() { return true; }

  function getConfiguredModel() {
    var cfg = window.JEJO_CONFIG || {};
    if (typeof window.getLlmModel === 'function') return window.getLlmModel();
    return cfg.grydModel || 'gcp-gemini-3.1-flash-lite-preview';
  }

  // ── main runner ──────────────────────────────────────────────────────────
  function runLlmBatches(opts) {
    return new Promise(function (resolve, reject) {
      var items           = opts.items || [];
      var batchSize       = opts.batchSize || 10;
      var maxConcurrent   = opts.maxConcurrent || 2;
      var minGapMs        = opts.minGapMs || 300;
      var maxRetries      = opts.maxRetries || 3;
      var requestTimeout  = opts.requestTimeoutMs || 60000;
      var getCacheKey     = opts.getCacheKey || null;
      var cachedData      = opts.cachedData || null;
      var buildPrompt     = opts.buildPrompt;
      var buildHeaders    = opts.buildHeaders || null;
      var parseResponse   = opts.parseResponse;
      var onProgress      = opts.onProgress || function () {};
      var signal          = opts.signal || null;

      if (!buildPrompt || !parseResponse) {
        reject(new Error('runLlmBatches requires buildPrompt and parseResponse'));
        return;
      }

      // ── chunk into batches ───────────────────────────────────────────
      var batches = [];
      for (var i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      if (batches.length === 0) {
        resolve({ results: new Map(), correctedCount: 0, failedBatches: [], aborted: false });
        return;
      }

      // ── handle cache ─────────────────────────────────────────────────
      if (cachedData && Array.isArray(cachedData)) {
        // Cache hit: caller's responsibility to apply cachedData. We just skip API.
        // We still need to return results in the expected shape.
        var cachedResults = new Map();
        var correctedCount = 0;
        for (var ci = 0; ci < cachedData.length; ci++) {
          var entry = cachedData[ci];
          if (entry && entry.isCorrect === false && entry.correctedDisposition) {
            cachedResults.set(entry.rowIndex, entry);
            correctedCount++;
          }
        }
        resolve({ results: cachedResults, correctedCount: correctedCount, failedBatches: [], fromCache: true, aborted: false });
        return;
      }

      // ── state ────────────────────────────────────────────────────────
      var throttle = createThrottleState(minGapMs);
      var batchResults = new Array(batches.length);
      var failedBatches = [];
      var completed = 0;
      var total = batches.length;
      var aborted = false;

      // Track active requests and current dynamic concurrency limit
      var activeRequests = 0;
      var currentMaxConcurrent = maxConcurrent;
      var lastRequestStart = 0;

      // Track the currently-active per-request controller so the caller's signal can cancel it
      var activeControllers = new Set();

      if (signal) {
        signal.addEventListener('abort', function () {
          aborted = true;
          activeControllers.forEach(function(controller) {
            try { controller.abort(); } catch (_) {}
          });
          activeControllers.clear();
        });
      }

      // No session pre-fetch needed — X-Handshake-Token is sent directly from config.

      // ── single batch request with retries and smart split-on-failure ─
      async function sendBatch(batch, batchIndex, trackFailure) {
        if (trackFailure === undefined) trackFailure = true;

        var prompt = buildPrompt(batch, batchIndex);
        if (!prompt) {
          return { ok: false, reason: 'buildPrompt returned null/undefined' };
        }

        var lastErr;
        // On 429 or other retryable errors, ensure we retry up to at least 5 times
        var allowedRetries = Math.max(maxRetries, 5);

        for (var attempt = 0; attempt <= allowedRetries; attempt++) {
          if (aborted) {
            return { ok: false, reason: 'Aborted' };
          }

          // wait for cooldown if throttled
          var now = Date.now();
          if (throttle.cooldownUntil > now) {
            await sleep(throttle.cooldownUntil - now);
            if (aborted) return { ok: false, reason: 'Aborted' };
          }

          // wait if we exceed current dynamic concurrency limit
          while (activeRequests >= currentMaxConcurrent && !aborted) {
            await sleep(100);
          }
          if (aborted) return { ok: false, reason: 'Aborted' };

          // Reserve slot immediately to prevent race condition
          activeRequests++;

          // wait the backoff if it's a retry attempt
          if (attempt > 0) {
            var backoffMs = jitter(Math.min(15000, 2000 * Math.pow(2, attempt - 1)));
            await sleep(backoffMs);
            if (aborted) { activeRequests--; return { ok: false, reason: 'Aborted' }; }
          }

          // stagger request starts to avoid instant burst collisions
          now = Date.now();
          var timeSinceLast = now - lastRequestStart;
          if (timeSinceLast < throttle.gapMs) {
            var delay = throttle.gapMs - timeSinceLast;
            lastRequestStart = now + delay;
            await sleep(delay);
          } else {
            lastRequestStart = now;
          }

          if (aborted) { activeRequests--; return { ok: false, reason: 'Aborted' }; }

          var controller = window.AbortController ? new window.AbortController() : null;
          var timeoutId = null;
          if (controller) {
            timeoutId = setTimeout(function () { controller.abort(); }, requestTimeout);
            activeControllers.add(controller);
          }

          try {
            var endpoint = typeof window.getApiEndpoint === 'function'
              ? window.getApiEndpoint()
              : (cfg.grydEndpoint || 'http://localhost:3456') + '/gryd/v1/chat/completions';

            var headers = {};
            if (typeof buildHeaders === 'function') {
              headers = buildHeaders() || {};
            } else {
              // default: Gryd headers
              headers['Content-Type'] = 'application/json';
              headers['Accept'] = 'application/json';
              var cfg = window.JEJO_CONFIG || {};
              headers['X-GRYD-TOKEN'] = sessionStorage.getItem('gryd_token') || '';
              headers['X-GRYD-SESSION-ID'] = sessionStorage.getItem('gryd_session_id') || '';
              headers['X-GRYD-ENTERPRISE-ID'] = sessionStorage.getItem('gryd_enterprise_id') || 'autocrm';
              headers['X-GRYD-SIGNUP-TOKEN'] = cfg.grydSignupToken || '';
              headers['X-GRYD-APPLICATION-ID'] = 'autocrm';
            }

            var bodyObj = {
              model: getConfiguredModel(),
              top_p: 1.00,
              messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user }
              ],
              temperature: prompt.temperature !== undefined ? prompt.temperature : 0.7,
              max_tokens: prompt.maxTokens || prompt.maxCompletionTokens || 8192
            };

            var response = await fetch(endpoint, {
              method: 'POST',
              headers: headers,
              signal: controller ? controller.signal : undefined,
              body: JSON.stringify(bodyObj)
            });

            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;
            if (controller) activeControllers.delete(controller);

            if (response.ok) {
              activeRequests = Math.max(0, activeRequests - 1);
              var data = await response.json();
              var text = '';
              if (data.choices && data.choices[0]) {
                text = data.choices[0].message ? data.choices[0].message.content : (data.choices[0].text || '');
              }
              if (!text) {
                throw new Error('Empty response from model');
              }
              var parsed = parseResponse(text, batch, batchIndex);
              recordSuccess(throttle);

              // Dynamically scale back up max concurrency limit if we're doing well
              if (throttle.consecutiveSuccesses >= 5 && currentMaxConcurrent < maxConcurrent) {
                currentMaxConcurrent++;
              }
              return { ok: true, data: parsed };
            }

            // Non-OK response
            var errText = '';
            try { errText = await response.text(); } catch (_) {}
            var errMsg = 'API ' + response.status + ': ' + (errText || 'unknown error').slice(0, 300);

            if (isClientError(response.status)) {
              activeRequests = Math.max(0, activeRequests - 1);
              var clientErr = new Error(errMsg);
              clientErr.nonRetryable = true;
              throw clientErr;
            }

            if (response.status === 429) {
              // Rate limited — dynamically throttle down concurrent requests to avoid piling up
              currentMaxConcurrent = Math.max(1, currentMaxConcurrent - 1);
              var retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
              recordThrottle(throttle, retryAfter);
            }

            lastErr = new Error(errMsg);
            activeRequests = Math.max(0, activeRequests - 1);
            // continue to retry

          } catch (e) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;
            if (controller) activeControllers.delete(controller);
            activeRequests = Math.max(0, activeRequests - 1);

            // Non-retryable client error — bail immediately
            if (e.nonRetryable) {
              if (trackFailure) failedBatches.push(batchIndex);
              return { ok: false, reason: e.message };
            }

            if (e.name === 'AbortError') {
              lastErr = new Error('Request timed out after ' + requestTimeout + 'ms');
            } else {
              lastErr = e;
            }
            // continue to retry
          }
        }

        // All retries exhausted — try splitting batch in half and retrying
        if (batch.length > MIN_SPLIT_SIZE) {
          var mid = Math.ceil(batch.length / 2);
          var leftResult = await sendBatch(batch.slice(0, mid), batchIndex, false);
          var rightResult = await sendBatch(batch.slice(mid), batchIndex, false);

          var combinedData = [];
          if (leftResult && leftResult.ok) combinedData = leftResult.data;
          if (rightResult && rightResult.ok) combinedData = combinedData.concat(rightResult.data);

          if (combinedData.length > 0) {
            return { ok: true, data: combinedData };
          }
        }

        if (trackFailure) failedBatches.push(batchIndex);
        return { ok: false, reason: lastErr ? lastErr.message : 'Max retries exceeded' };
      }

      // ── concurrent worker ────────────────────────────────────────────
      var nextBatch = 0;

      async function worker() {
        while (nextBatch < batches.length && !aborted) {
          var idx = nextBatch++;
          var batch = batches[idx];
          var result = await sendBatch(batch, idx);
          batchResults[idx] = result;
          completed++;
          var pct = Math.round((completed / total) * 100);
          var msg = 'AI validating… ' + completed + '/' + total + ' batches';
          if (result.ok) {
            onProgress(completed, total, msg, pct);
          } else {
            console.error('Batch ' + (idx + 1) + ' failed:', result && result.reason);
            onProgress(completed, total, 'Batch ' + (idx + 1) + ' failed, continuing…', pct);
          }
        }
      }

      // ── kick off workers ─────────────────────────────────────────────
      var workerCount = Math.min(maxConcurrent, batches.length);
      var workers = [];
      for (var w = 0; w < workerCount; w++) {
        workers.push(worker());
      }

      Promise.all(workers).then(function () {
        // ── assemble results ───────────────────────────────────────────
        var resultsMap = new Map();
        var correctedCount = 0;
        for (var bi = 0; bi < batchResults.length; bi++) {
          var br = batchResults[bi];
          if (br && br.ok && br.data) {
            var parsedArr = br.data;
            var batchStart = bi * batchSize;
            for (var ri = 0; ri < parsedArr.length; ri++) {
              var itemResult = parsedArr[ri];
              if (itemResult && itemResult.rowIndex !== undefined) {
                resultsMap.set(itemResult.rowIndex, itemResult);
                if (itemResult.isCorrect === false && itemResult.correctedDisposition) {
                  correctedCount++;
                }
              }
            }
          }
        }

        resolve({
          results: resultsMap,
          correctedCount: correctedCount,
          failedBatches: failedBatches,
          fromCache: false,
          aborted: aborted
        });
      }).catch(function (err) {
        reject(err);
      });
    });
  }

  window.runLlmBatches = runLlmBatches;
})();
