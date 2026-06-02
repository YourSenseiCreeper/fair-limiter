// popup.js

const CIRCUMFERENCE = 2 * Math.PI * 56; // r=56

function fmtTime(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtUsed(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ring       = document.getElementById('ring-fill');
const $timeLeft   = document.getElementById('time-left');
const $ringLabel  = document.getElementById('ring-label');
const $statusPill = document.getElementById('status-pill');
const $statusDot  = document.getElementById('status-dot');
const $statusText = document.getElementById('status-text');
const $usedTime   = document.getElementById('used-time');
const $limitDisp  = document.getElementById('limit-display');
const $slider     = document.getElementById('limit-slider');
const $sliderVal  = document.getElementById('limit-slider-val');
const $btnExtra   = document.getElementById('btn-extra');
const $btnReset   = document.getElementById('btn-reset');
const $dayBadge   = document.getElementById('day-badge');

$dayBadge.textContent = todayStr();

// ── render ────────────────────────────────────────────────────────────────────
function render(state) {
  const { elapsed = 0, limitMs = 3600000, limitReached = false,
          tracking = false, extraUsed = false } = state;

  const remaining = Math.max(0, limitMs - elapsed);
  const pct = Math.min(1, elapsed / limitMs);
  const offset = CIRCUMFERENCE * (1 - pct);

  // Ring
  $ring.style.strokeDashoffset = offset;
  $ring.classList.toggle('warn',  !limitReached && remaining < 120_000);
  $ring.classList.toggle('done',  limitReached);

  // Center text
  if (limitReached) {
    $timeLeft.textContent = '✕';
    $ringLabel.textContent = 'limit reached';
  } else {
    $timeLeft.textContent = fmtTime(remaining);
    $ringLabel.textContent = 'remaining';
  }

  // Status pill
  $statusPill.className = 'status-pill ' + (limitReached ? 'limited' : tracking ? 'active' : 'idle');
  $statusDot.className  = 'dot ' + (tracking && !limitReached ? 'pulse' : '');
  $statusText.textContent = limitReached ? 'Limit reached' : tracking ? 'Watching now' : 'Not active';

  // Stats
  $usedTime.textContent  = fmtUsed(elapsed);
  $limitDisp.textContent = fmtUsed(limitMs);

  // Slider
  const sliderMin = Math.ceil(limitMs / 60000);
  $slider.value = sliderMin;
  $sliderVal.textContent = fmtUsed(limitMs);

  // Extra button
  $btnExtra.disabled = !limitReached || extraUsed;
  $btnExtra.textContent = extraUsed ? '✓ Extra time used' : '⏱ +5 min grace period';
}

// ── load state ────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  if (state) render(state);
});

// ── listen for live updates ───────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE') {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => { if (s) render(s); });
  }
});

// ── slider ────────────────────────────────────────────────────────────────────
let sliderTimer = null;
$slider.addEventListener('input', () => {
  const val = parseInt($slider.value, 10);
  $sliderVal.textContent = fmtUsed(val * 60000);
  clearTimeout(sliderTimer);
  sliderTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'SET_LIMIT', limitMs: val * 60000 }, () => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => { if (s) render(s); });
    });
  }, 600);
});

// ── extra button ──────────────────────────────────────────────────────────────
$btnExtra.addEventListener('click', () => {
  $btnExtra.disabled = true;
  chrome.runtime.sendMessage({ type: 'GRANT_EXTRA' }, () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => { if (s) render(s); });
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────
$btnReset.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_DAY' }, () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => { if (s) render(s); });
  });
});
