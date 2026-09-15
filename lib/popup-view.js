// Popup rendering depends only on DOM elements and formatting rules.
((root) => {
  function createPopupView(document, format) {
    const circumference = 2 * Math.PI * 56;
    const ring = document.getElementById('ring-fill');
    const timeLeft = document.getElementById('time-left');
    const ringLabel = document.getElementById('ring-label');
    const statusPill = document.getElementById('status-pill');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const usedTime = document.getElementById('used-time');
    const limitDisplay = document.getElementById('limit-display');
    const rolloverDisplay = document.getElementById('rollover-display');
    const graceButton = document.getElementById('btn-extra');
    const graceActions = document.getElementById('grace-actions');

    function render(state) {
      const { elapsed = 0, limitMs = 3600000, limitReached = false,
        effectiveLimitMs = limitMs, rolloverRemainingMs = 0,
        tracking = false, extraUsed = false } = state;
      const remaining = Math.max(0, effectiveLimitMs - elapsed);
      const fraction = Math.min(1, elapsed / effectiveLimitMs);
      ring.style.strokeDashoffset = circumference * (1 - fraction);
      ring.classList.toggle('warn', !limitReached && remaining < 120_000);
      ring.classList.toggle('done', limitReached);

      timeLeft.textContent = limitReached ? '✕' : format.remaining(remaining);
      ringLabel.textContent = limitReached ? 'limit reached' : 'remaining';
      statusPill.className = 'status-pill ' + (limitReached ? 'limited' : tracking ? 'active' : 'idle');
      statusDot.className = 'dot ' + (tracking && !limitReached ? 'pulse' : '');
      statusText.textContent = limitReached ? 'Limit reached' : tracking ? 'Watching now' : 'Not active';

      usedTime.textContent = format.used(elapsed);
      limitDisplay.textContent = format.used(limitMs);
      rolloverDisplay.textContent = format.used(rolloverRemainingMs);
      graceButton.disabled = !limitReached || extraUsed;
      graceButton.textContent = extraUsed ? '✓ Extra time used' : '⏱ +5 min grace period';
    }

    return Object.freeze({
      render,
      graceButton,
      showGrace(enabled) { graceActions.hidden = !enabled; }
    });
  }

  root.YtLimiterPopupView = Object.freeze({ createPopupView });
})(globalThis);
