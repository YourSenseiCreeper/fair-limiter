// options.js

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtUsed(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtExactDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes || hours) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
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
  const count = range === 'year' ? 365 : range === 'month' ? 30 : 7;
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    return date;
  });
}

function renderYearHistory(chart, days, values) {
  chart.className = 'year-chart';
  chart.setAttribute('aria-label', 'YouTube watch time for the last 365 days');

  const startOffset = (days[0].getDay() + 6) % 7;
  const weekCount = Math.ceil((startOffset + days.length) / 7);
  const max = Math.max(...values, 1);
  const scroll = document.createElement('div');
  scroll.className = 'heatmap-scroll';
  const content = document.createElement('div');
  content.className = 'heatmap-content';
  content.style.setProperty('--week-count', weekCount);

  const months = document.createElement('div');
  months.className = 'heatmap-months';
  const labelledMonths = new Set();
  days.forEach((date, index) => {
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    if (labelledMonths.has(monthKey)) return;
    labelledMonths.add(monthKey);
    const label = document.createElement('span');
    label.className = 'heatmap-month';
    label.style.gridColumn = String(Math.floor((startOffset + index) / 7) + 1);
    label.textContent = date.toLocaleDateString(undefined, { month:'short' });
    months.appendChild(label);
  });

  const body = document.createElement('div');
  body.className = 'heatmap-body';
  const weekdays = document.createElement('div');
  weekdays.className = 'heatmap-weekdays';
  ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach(label => {
    const day = document.createElement('span');
    day.textContent = label;
    weekdays.appendChild(day);
  });

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'YouTube watch time for the last 365 days');
  const todayKey = localDateKey(new Date());
  days.forEach((date, index) => {
    const value = values[index];
    const dateKey = localDateKey(date);
    const level = value ? Math.min(4, Math.ceil(value / max * 4)) : 0;
    const tooltip = `${date.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' })}: ${fmtExactDuration(value)}`;
    const cell = document.createElement('div');
    cell.className = `heatmap-cell${dateKey === todayKey ? ' today' : ''}`;
    cell.dataset.level = String(level);
    cell.style.gridColumn = String(Math.floor((startOffset + index) / 7) + 1);
    cell.style.gridRow = String(((date.getDay() + 6) % 7) + 1);
    cell.title = tooltip;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', tooltip);
    grid.appendChild(cell);
  });

  body.append(weekdays, grid);
  content.append(months, body);
  scroll.appendChild(content);

  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  const less = document.createElement('span');
  less.textContent = 'Less';
  legend.appendChild(less);
  for (let level = 0; level <= 4; level++) {
    const swatch = document.createElement('span');
    swatch.className = 'heatmap-cell';
    swatch.dataset.level = String(level);
    swatch.setAttribute('aria-hidden', 'true');
    legend.appendChild(swatch);
  }
  const more = document.createElement('span');
  more.textContent = 'More';
  legend.appendChild(more);
  chart.append(scroll, legend);
}

function renderHistory(history) {
  const days = getHistoryDays(historyRange);
  const values = days.map(date => history[localDateKey(date)] ?? 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  const active = values.filter(value => value > 0).length;
  const chart = document.getElementById('history-chart');
  chart.textContent = '';

  if (historyRange === 'year') {
    renderYearHistory(chart, days, values);
  } else {
    chart.className = `chart ${historyRange}`;
    chart.setAttribute('aria-label', `Daily YouTube watch time for the last ${days.length} days`);

  days.forEach((date, index) => {
    const value = values[index];
    const column = document.createElement('div');
    column.className = `chart-column${localDateKey(date) === localDateKey(new Date()) ? ' today' : ''}`;
    column.title = `${date.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' })}: ${fmtExactDuration(value)}`;

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
  }

  document.getElementById('history-total').textContent = fmtUsed(total);
  document.getElementById('history-period').textContent = historyRange === 'year'
    ? 'Last 365 days'
    : historyRange === 'week' ? 'Last 7 days' : 'Last 30 days';
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
const $warningSlider = document.getElementById('warning-minutes-slider');
const $warningBadge = document.getElementById('warning-minutes-badge');
const $warningWrap = document.getElementById('warning-minutes-wrap');
const $toggleClose  = document.getElementById('toggle-close-tab');
const $toggleGrace  = document.getElementById('toggle-grace');
const $toggleRollover = document.getElementById('toggle-rollover');
const $rolloverCapSlider = document.getElementById('rollover-cap-slider');
const $rolloverCapBadge = document.getElementById('rollover-cap-badge');
const $rolloverCapWrap = document.getElementById('rollover-cap-wrap');
const $rolloverCurrent = document.getElementById('rollover-current');
const $saveTimer    = document.getElementById('save-timer');

function updateRolloverControls() {
  const enabled = $toggleRollover.checked;
  $rolloverCapSlider.disabled = !enabled;
  $rolloverCapWrap.classList.toggle('disabled', !enabled);
}

function updateWarningControls() {
  $warningSlider.disabled = !$toggleWarn.checked;
  $warningWrap.classList.toggle('disabled', !$toggleWarn.checked);
}

updateRolloverControls();
updateWarningControls();

// Load timer state
chrome.runtime.sendMessage({ type: 'GET_STATE' }, state => {
  if (!state) return;
  const minutes = Math.round((state.limitMs ?? 3600000) / 60000);
  $timerSlider.value = minutes;
  $timerBadge.textContent = fmtUsed(minutes * 60000);
  const rolloverCapMinutes = Math.round((state.rolloverDailyCapMs ?? 1800000) / 60000);
  $toggleRollover.checked = state.rolloverEnabled ?? false;
  $rolloverCapSlider.value = rolloverCapMinutes;
  $rolloverCapBadge.textContent = fmtUsed(rolloverCapMinutes * 60000);
  $rolloverCurrent.textContent = `Currently saved: ${fmtUsed(state.rolloverRemainingMs ?? 0)} of 1h 30m`;
  updateRolloverControls();
});

// Load timer toggles from storage
chrome.storage.local.get(['timerWarn', 'timerWarnMinutes', 'timerCloseTab', 'timerGrace'], data => {
  $toggleWarn.checked  = data.timerWarn     ?? true;
  const warningMinutes = Number(data.timerWarnMinutes);
  $warningSlider.value = Number.isFinite(warningMinutes)
    ? Math.min(15, Math.max(1, Math.round(warningMinutes))) : 1;
  $warningBadge.textContent = `${$warningSlider.value}m`;
  $toggleClose.checked = data.timerCloseTab ?? true;
  $toggleGrace.checked = data.timerGrace    ?? true;
  updateWarningControls();
});

$timerSlider.addEventListener('input', () => {
  $timerBadge.textContent = fmtUsed($timerSlider.value * 60000);
});

$toggleRollover.addEventListener('change', updateRolloverControls);
$toggleWarn.addEventListener('change', updateWarningControls);

$warningSlider.addEventListener('input', () => {
  $warningBadge.textContent = `${$warningSlider.value}m`;
});

$rolloverCapSlider.addEventListener('input', () => {
  $rolloverCapBadge.textContent = fmtUsed($rolloverCapSlider.value * 60000);
});

$saveTimer.addEventListener('click', () => {
  const limitMs = parseInt($timerSlider.value, 10) * 60000;

  chrome.runtime.sendMessage({ type: 'SET_LIMIT', limitMs }, () => {
    chrome.runtime.sendMessage({
      type: 'SET_ROLLOVER',
      enabled: $toggleRollover.checked,
      dailyCapMs: parseInt($rolloverCapSlider.value, 10) * 60000
    }, () => chrome.storage.local.set({
      timerWarn:     $toggleWarn.checked,
      timerWarnMinutes: parseInt($warningSlider.value, 10),
      timerCloseTab: $toggleClose.checked,
      timerGrace:    $toggleGrace.checked,
    }, () => showToast('✓ Timer settings saved')));
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
