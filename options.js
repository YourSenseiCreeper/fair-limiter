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
function selectTab(tab) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const panel = document.getElementById(`panel-${tab}`);
  if (!btn || !panel) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  panel.classList.add('active');
  if (tab === 'history') loadHistory();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectTab(btn.dataset.tab);
    history.replaceState(null, '', `#${btn.dataset.tab}`);
  });
});

// ── HISTORY TAB ──────────────────────────────────────────────────────────────
let historyRange = 'week';

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getHistoryDays(range) {
  const count = range === 'month' ? 30 : 7;
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    return date;
  });
}

function renderHistory(history) {
  const days = getHistoryDays(historyRange);
  const values = days.map(date => history[localDateKey(date)] ?? 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  const active = values.filter(value => value > 0).length;
  const chart = document.getElementById('history-chart');
  chart.textContent = '';

  days.forEach((date, index) => {
    const value = values[index];
    const column = document.createElement('div');
    column.className = `chart-column${localDateKey(date) === localDateKey(new Date()) ? ' today' : ''}`;
    column.title = `${date.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' })}: ${fmtUsed(value)}`;

    const valueLabel = document.createElement('span');
    valueLabel.className = 'chart-value';
    valueLabel.textContent = value ? fmtUsed(value) : '–';
    const track = document.createElement('div');
    track.className = 'chart-track';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${value ? Math.max(3, value / max * 100) : 0}%`;
    track.appendChild(bar);
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = historyRange === 'week'
      ? date.toLocaleDateString(undefined, { weekday:'short' }).slice(0, 2)
      : (index % 5 === 0 || index === days.length - 1 ? date.getDate() : '');
    column.append(valueLabel, track, label);
    chart.appendChild(column);
  });

  document.getElementById('history-total').textContent = fmtUsed(total);
  document.getElementById('history-period').textContent = historyRange === 'week' ? 'Last 7 days' : 'Last 30 days';
  document.getElementById('history-average').textContent = fmtUsed(total / days.length);
  document.getElementById('history-longest').textContent = fmtUsed(Math.max(...values));
  document.getElementById('history-active').textContent = String(active);
}

function loadHistory() {
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, data => renderHistory(data?.history ?? {}));
}

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    historyRange = btn.dataset.range;
    document.querySelectorAll('.range-btn').forEach(item => item.classList.toggle('active', item === btn));
    loadHistory();
  });
});

const initialTab = location.hash.slice(1);
if (initialTab) selectTab(initialTab);

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
