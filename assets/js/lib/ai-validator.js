/**
 * AI Validator — shared status bar, auth, and cache helpers for all AutoNage tools.
 *
 * Consolidates:
 *  - showAiStatusBar / updateAiStatusBar / hideAiStatusBar / cancelAiValidation
 *    (was duplicated identically in disposition_sync_v2.js and post_sales_disposition.js)
 *  - buildNvidiaHeaders / isRetryableNvidiaError
 *    (was duplicated in dashboard.js alongside the identical logic in llm-batch-runner.js)
 */
(function () {
  if (typeof window !== 'undefined' && window.AiValidator) return;

  var NV_API = 'https://integrate.api.nvidia.com/v1/chat/completions';
  var OR_API = 'https://openrouter.ai/api/v1/chat/completions';

  function isProxyEndpoint(endpoint) {
    return endpoint !== NV_API && endpoint !== OR_API;
  }

  // ── StatusBar ────────────────────────────────────────────────────────────
  // Manages the #aiValidationStatus bar, aiStatus* elements, and elapsed timer.
  // The HTML for the bar is pre-defined in both disposition sync pages.
  //
  var _timer = null;
  var _startTime = null;
  var _active = false;
  var _controller = null;

  /** Returns the AbortSignal (or null if no bar found). */
  function showStatusBar(total) {
    if (_timer) { clearInterval(_timer); _timer = null; }

    var bar = document.getElementById('aiValidationStatus');
    if (!bar) return null;

    _active = true;
    _startTime = Date.now();

    // Set default states — caller can override msg/batch afterwards
    var msg = document.getElementById('aiStatusMsg');
    var bat = document.getElementById('aiStatusBatch');
    var cor = document.getElementById('aiStatusCorrected');
    var elap = document.getElementById('aiStatusElapsed');
    var fill = document.getElementById('aiStatusFill');
    var act = document.getElementById('aiStatusActions');

    if (msg)  msg.textContent = 'AI validating\u2026';
    if (bat)  bat.textContent = '0/' + (total || '?');
    if (cor)  { cor.style.display = 'none'; cor.textContent = ''; }
    if (fill) fill.style.width = '0%';
    if (elap) elap.textContent = '';

    bar.style.display = 'block';

    // Inject cancel button
    if (act) {
      act.innerHTML =
        '<button class="ai-status-btn cancel" id="aiStatusCancel" onclick="AiValidator.cancel()">Cancel</button>';
    }

    // Elapsed-time ticker
    _timer = setInterval(function () {
      if (!_active) return;
      var secs = Math.floor((Date.now() - _startTime) / 1000);
      var m = Math.floor(secs / 60);
      var s = secs % 60;
      if (elap) elap.textContent = (m > 0 ? m + 'm ' : '') + s + 's';
    }, 1000);

    _controller = new AbortController();
    return _controller.signal;
  }

  function updateStatusBar(done, total, message, pct, correctedResults) {
    var bat  = document.getElementById('aiStatusBatch');
    var fill = document.getElementById('aiStatusFill');
    var msg  = document.getElementById('aiStatusMsg');
    var cor  = document.getElementById('aiStatusCorrected');

    if (bat)  bat.textContent = done + '/' + total;
    if (fill) fill.style.width = pct + '%';
    if (msg && message !== undefined && message !== null) msg.textContent = message;

    if (cor && correctedResults) {
      var count = 0;
      if (correctedResults instanceof Map) {
        count = correctedResults.size;
      } else {
        for (var k in correctedResults) {
          if (correctedResults.hasOwnProperty(k)) count++;
        }
      }
      if (count > 0) {
        cor.style.display = 'inline';
        cor.textContent = count + ' corrected';
      }
    }
  }

  /**
   * Hides the status bar, showing a final message and action buttons.
   * @param {Object} correctedResults — keyed by row index
   * @param {Boolean} abortWasRequested — true if the user cancelled
   * @param {Function} rerunFn — function to call for retry (default: none)
   */
  function hideStatusBar(correctedResults, abortWasRequested, rerunFn) {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _active = false;

    var bar  = document.getElementById('aiValidationStatus');
    var msg  = document.getElementById('aiStatusMsg');
    var bat  = document.getElementById('aiStatusBatch');
    var cor  = document.getElementById('aiStatusCorrected');
    var elap = document.getElementById('aiStatusElapsed');
    var fill = document.getElementById('aiStatusFill');
    var act  = document.getElementById('aiStatusActions');

    // Count corrections
    var correctedCount = 0;
    if (correctedResults) {
      if (correctedResults instanceof Map) {
        correctedCount = correctedResults.size;
      } else {
        for (var k in correctedResults) {
          if (correctedResults.hasOwnProperty(k)) correctedCount++;
        }
      }
    }

    // ─── CANCELLED STATE ───────────────────────────────────────────────
    if (abortWasRequested) {
      if (bar)  bar.className = 'ai-status-bar aborted';
      if (msg)  { msg.textContent = 'AI validation cancelled.'; msg.className = 'ai-status-msg err'; }
      if (fill) { fill.style.width = '0%'; fill.className = 'ai-status-fill err'; }
      if (bat)  bat.className = 'ai-status-badge err';

      if (act) {
        act.textContent = '';
        var dismissBtn = document.createElement('button');
        dismissBtn.className = 'ai-status-btn';
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.addEventListener('click', function () {
          var el = document.getElementById('aiValidationStatus');
          if (el) el.style.display = 'none';
        });
        act.appendChild(dismissBtn);

        if (typeof rerunFn === 'function') {
          var rerunBtn = document.createElement('button');
          rerunBtn.className = 'ai-status-btn primary';
          rerunBtn.textContent = '\u21bb Run again';
          rerunBtn.addEventListener('click', rerunFn);
          act.appendChild(rerunBtn);
        }
      }

      _controller = null;
      return;
    }

    // ─── COMPLETED STATE ───────────────────────────────────────────────
    var totalDone = bat ? bat.textContent : 'done';

    if (bar)  bar.className = 'ai-status-bar';
    if (msg) {
      msg.textContent = correctedCount > 0
        ? 'AI validation complete \u2014 ' + correctedCount + ' disposition(s) corrected.'
        : 'AI validation complete \u2014 all dispositions appear correct.';
      msg.className = 'ai-status-msg ok';
    }
    if (bat) { bat.textContent = totalDone; bat.className = 'ai-status-badge done'; }
    if (fill) { fill.className = 'ai-status-fill ok'; fill.style.width = '100%'; }

    if (cor) {
      cor.style.display = correctedCount > 0 ? 'inline' : 'none';
      if (correctedCount > 0) cor.textContent = correctedCount + ' corrected';
    }

    // Update elapsed one last time
    if (elap && _startTime) {
      var secs = Math.floor((Date.now() - _startTime) / 1000);
      var m = Math.floor(secs / 60);
      var s = secs % 60;
      elap.textContent = (m > 0 ? m + 'm ' : '') + s + 's';
    }

    // Actions: Dismiss + Re-run
    if (act) {
      act.textContent = '';
      var dismissBtn2 = document.createElement('button');
      dismissBtn2.className = 'ai-status-btn';
      dismissBtn2.textContent = 'Dismiss';
      dismissBtn2.addEventListener('click', function () {
        var el = document.getElementById('aiValidationStatus');
        if (el) el.style.display = 'none';
      });
      act.appendChild(dismissBtn2);

      if (typeof rerunFn === 'function') {
        var rerunBtn2 = document.createElement('button');
        rerunBtn2.className = 'ai-status-btn primary';
        rerunBtn2.textContent = '\u21bb Re-run AI';
        rerunBtn2.addEventListener('click', rerunFn);
        act.appendChild(rerunBtn2);
      }
    }

    _controller = null;
  }

  /** Quick dismiss — just hides the bar. */
  function dismissStatusBar() {
    var bar = document.getElementById('aiValidationStatus');
    if (bar) bar.style.display = 'none';
  }

  function cancel() {
    if (_controller) {
      _controller.abort();
    }
  }

  function isCancelled() {
    return _controller && _controller.signal.aborted;
  }

  function getSignal() {
    return _controller ? _controller.signal : null;
  }

  // ── buildHeaders (NVIDIA / proxy) ────────────────────────────────────────
  // Convenience: generates auth headers matching the llm-batch-runner defaults.
  // For proxy endpoints, sends X-Handshake-Token from config.js proxyHandshakeToken.
  function buildHeaders() {
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    var endpoint = typeof window.getApiEndpoint === 'function'
      ? window.getApiEndpoint()
      : NV_API;

    if (isProxyEndpoint(endpoint)) {
      // Send static handshake token directly — no session endpoint needed.
      var cfg = window.JEJO_CONFIG || {};
      var handshakeToken = (cfg.proxyHandshakeToken || '').trim();
      if (handshakeToken) {
        headers['X-Handshake-Token'] = handshakeToken;
      }
    } else {
      var apiKey = typeof window.getApiKey === 'function' ? window.getApiKey() : '';
      if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    }

    return headers;
  }

  // ── Session token cache ──────────────────────────────────────────────────
  // Kept for API compatibility — returns the cached handshake token if set.
  // The X-Handshake-Token approach no longer requires a /session endpoint.
  var _sessionToken = null;
  var _sessionEndpoint = null;
  var _sessionExpiresAt = 0;

  function getCachedSessionToken(proxyEndpoint) {
    // Legacy stub — no-op. buildHeaders() now reads proxyHandshakeToken directly.
    return null;
  }

  /**
   * Fetches a new session token from the proxy endpoint.
   * The endpoint URL is derived by replacing the path suffix (/v1/chat/completions)
   * with /session. If the endpoint doesn't end with the expected path, we fall
   * back to using the origin + '/session'.
   *
   * Returns the token string, or throws on failure.
   */
  function fetchSessionToken(proxyEndpoint) {
    var sessionUrl = proxyEndpoint;
    if (/\/v1\/chat\/completions$/.test(proxyEndpoint)) {
      sessionUrl = proxyEndpoint.replace(/\/v1\/chat\/completions$/, '/session');
    } else {
      // Fallback: try origin + '/session'
      try {
        var u = new URL(proxyEndpoint);
        sessionUrl = u.origin + '/session';
      } catch (e) {
        // If URL parsing fails, just append /session
        sessionUrl = proxyEndpoint.replace(/\/?$/, '/session');
      }
    }

    return fetch(sessionUrl)
      .then(function(r) {
        if (!r.ok) throw new Error('Session endpoint returned ' + r.status);
        return r.json();
      })
      .then(function(data) {
        if (data && data.token) {
          // Cache with 4-minute window (server TTL is 5 min)
          _sessionToken = data.token;
          _sessionEndpoint = proxyEndpoint;
          _sessionExpiresAt = Date.now() + 4 * 60 * 1000;
          return data.token;
        }
        throw new Error('No session token in response');
      });
  }

  // ── isRetryableStatus ────────────────────────────────────────────────────
  function isRetryableStatus(status) {
    return status === 408 || status === 409 || status === 425 ||
           status === 429 || status === 500 || status === 502 ||
           status === 503 || status === 504 || status === 523 ||
           status === 524;
  }

  // ── public API ───────────────────────────────────────────────────────────
  window.AiValidator = {
    showStatusBar:     showStatusBar,
    updateStatusBar:   updateStatusBar,
    hideStatusBar:     hideStatusBar,
    dismissStatusBar:  dismissStatusBar,
    cancel:            cancel,
    isCancelled:       isCancelled,
    getSignal:         getSignal,
    buildHeaders:      buildHeaders,
    isRetryableStatus: isRetryableStatus,
    getCachedSessionToken: getCachedSessionToken,
    fetchSessionToken: fetchSessionToken
  };
})();
