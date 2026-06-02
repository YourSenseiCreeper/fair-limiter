// options.js

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtUsed(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function showToast(msg = '✓ Settings saved', color = 'var(--green)') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.color = color;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── TIMER TAB ─────────────────────────────────────────────────────────────────
const $timerSlider  = document.getElementById('timer-slider');
const $timerBadge   = document.getElementById('timer-val-badge');
const $toggleWarn   = document.getElementById('toggle-warn');
const $toggleClose  = document.getElementById('toggle-close-tab');
const $toggleGrace  = document.getElementById('toggle-grace');
const $saveTimer    = document.getElementById('save-timer');

// Load timer state
chrome.runtime.sendMessage({ type: 'GET_STATE' }, state => {
  if (!state) return;
  const minutes = Math.round((state.limitMs ?? 3600000) / 60000);
  $timerSlider.value = minutes;
  $timerBadge.textContent = fmtUsed(minutes * 60000);
});

// Load timer toggles from storage
chrome.storage.local.get(['timerWarn', 'timerCloseTab', 'timerGrace'], data => {
  $toggleWarn.checked  = data.timerWarn     ?? true;
  $toggleClose.checked = data.timerCloseTab ?? true;
  $toggleGrace.checked = data.timerGrace    ?? true;
});

$timerSlider.addEventListener('input', () => {
  $timerBadge.textContent = fmtUsed($timerSlider.value * 60000);
});

$saveTimer.addEventListener('click', () => {
  const limitMs = parseInt($timerSlider.value, 10) * 60000;

  chrome.runtime.sendMessage({ type: 'SET_LIMIT', limitMs }, () => {
    chrome.storage.local.set({
      timerWarn:     $toggleWarn.checked,
      timerCloseTab: $toggleClose.checked,
      timerGrace:    $toggleGrace.checked,
    }, () => showToast('✓ Timer settings saved'));
  });
});

// ── SHORTS TAB ────────────────────────────────────────────────────────────────
const $toggleHide    = document.getElementById('toggle-hide-sections');
const $toggleBlock   = document.getElementById('toggle-block-playback');
const $saveBar       = document.getElementById('save-bar-shorts');
const $saveShorts    = document.getElementById('save-shorts');
const $discardShorts = document.getElementById('discard-shorts');

// Track original values to detect unsaved changes
let origHide  = false;
let origBlock = false;

// Load Shorts settings
chrome.runtime.sendMessage({ type: 'GET_SHORTS' }, data => {
  if (!data) return;
  $toggleHide.checked  = origHide  = data.hideSections;
  $toggleBlock.checked = origBlock = data.blockPlayback;
});

function checkShortsChanged() {
  const changed = $toggleHide.checked !== origHide || $toggleBlock.checked !== origBlock;
  $saveBar.classList.toggle('hidden', !changed);
}

$toggleHide.addEventListener('change',  checkShortsChanged);
$toggleBlock.addEventListener('change', checkShortsChanged);

$saveShorts.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type:         'SET_SHORTS',
    hideSections:  $toggleHide.checked,
    blockPlayback: $toggleBlock.checked,
  }, () => {
    origHide  = $toggleHide.checked;
    origBlock = $toggleBlock.checked;
    $saveBar.classList.add('hidden');
    showToast('✓ Shorts settings saved', 'var(--violet2)');
  });
});

$discardShorts.addEventListener('click', () => {
  $toggleHide.checked  = origHide;
  $toggleBlock.checked = origBlock;
  $saveBar.classList.add('hidden');
});
