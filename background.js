// ── constants ────────────────────────────────────────────────────────────────
const DAILY_LIMIT_MS   = 60 * 60 * 1000;   // 1 hour default (user-configurable)
const EXTRA_TIME_MS    = 5  * 60 * 1000;   // 5 minutes bonus
const DEFAULT_ROLLOVER_DAILY_CAP_MS = 30 * 60 * 1000;
const MAX_ROLLOVER_BANK_MS = 90 * 60 * 1000;
const TICK_INTERVAL_S  = 10;               // how often we persist elapsed time
const ALARM_TICK       = 'yt_tick';

// ── helpers ──────────────────────────────────────────────────────────────────
function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clampRolloverBank(value) {
  return Math.min(MAX_ROLLOVER_BANK_MS, Math.max(0, Number(value) || 0));
}

function normalizeRolloverDailyCap(value) {
  const minimum = 5 * 60 * 1000;
  const numericValue = Number(value);
  return Math.min(MAX_ROLLOVER_BANK_MS, Math.max(minimum,
    Number.isFinite(numericValue) ? numericValue : DEFAULT_ROLLOVER_DAILY_CAP_MS));
}

function normalizeWarningMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? Math.min(15, Math.max(1, Math.round(minutes))) : 1;
}

function dayNumber(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '');
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function calculateRolloverForNewDay(data, today) {
  if (!(data.rolloverEnabled ?? false) || !data.date) return 0;

  const limitMs = Number.isFinite(data.limitMs) ? data.limitMs : DAILY_LIMIT_MS;
  const elapsed = Math.max(0, Number(data.elapsed) || 0);
  const dailyCap = normalizeRolloverDailyCap(data.rolloverDailyCapMs);
  const currentBank = clampRolloverBank(data.rolloverBankMs);

  // Today's allowance is always spent first; only usage above it consumes the bank.
  const bankUsed = Math.min(currentBank, Math.max(0, elapsed - limitMs));
  const unusedDailyLimit = Math.max(0, limitMs - elapsed);
  let nextBank = currentBank - bankUsed + Math.min(unusedDailyLimit, dailyCap);

  // Each completely missed day also contributes up to the configured daily cap.
  const previousDay = dayNumber(data.date);
  const currentDay = dayNumber(today);
  const gap = previousDay === null || currentDay === null ? 1 : Math.max(1, currentDay - previousDay);
  nextBank += Math.max(0, gap - 1) * Math.min(limitMs, dailyCap);

  return clampRolloverBank(nextBank);
}

function buildState(data, today = todayKey()) {
  const elapsed = Math.max(0, Number(data.elapsed) || 0);
  const limitMs = Number.isFinite(data.limitMs) ? data.limitMs : DAILY_LIMIT_MS;
  const rolloverEnabled = data.rolloverEnabled ?? false;
  const rolloverBankMs = rolloverEnabled ? clampRolloverBank(data.rolloverBankMs) : 0;
  const rolloverUsedMs = Math.min(rolloverBankMs, Math.max(0, elapsed - limitMs));
  const rolloverRemainingMs = rolloverBankMs - rolloverUsedMs;
  const effectiveLimitMs = limitMs + rolloverBankMs + (data.extraUsed ? EXTRA_TIME_MS : 0);

  return {
    date: today,
    elapsed,
    limitMs,
    effectiveLimitMs,
    rolloverEnabled,
    rolloverDailyCapMs: normalizeRolloverDailyCap(data.rolloverDailyCapMs),
    rolloverBankMs,
    rolloverRemainingMs,
    limitReached: elapsed >= effectiveLimitMs,
    extraUsed: data.extraUsed ?? false,
    tracking: data.tracking ?? false,
    ytTabId: data.ytTabId ?? null
  };
}

async function updateHistory(date, elapsed) {
  const data = await chrome.storage.local.get('watchHistory');
  const history = data.watchHistory ?? {};
  history[date] = Math.max(0, elapsed);

  // Keep one year of daily entries so storage cannot grow indefinitely.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  Object.keys(history).forEach(key => { if (key < cutoffKey) delete history[key]; });

  await chrome.storage.local.set({ watchHistory: history });
}

async function getState() {
  const data = await chrome.storage.local.get([
    'date', 'elapsed', 'limitMs', 'limitReached',
    'extraUsed', 'tracking', 'ytTabId', 'rolloverEnabled',
    'rolloverDailyCapMs', 'rolloverBankMs'
  ]);
  const today = todayKey();
  // Reset elapsed if it's a new day
  if (data.date !== today) {
    if (data.date && Number.isFinite(data.elapsed)) {
      await updateHistory(data.date, data.elapsed);
    }
    const rolloverBankMs = calculateRolloverForNewDay(data, today);
    const nextData = {
      ...data,
      date: today,
      elapsed: 0,
      limitReached: false,
      extraUsed: false,
      tracking: data.tracking ?? false,
      ytTabId: data.ytTabId ?? null,
      rolloverBankMs
    };
    await chrome.storage.local.set(nextData);
    return buildState(nextData, today);
  }
  return buildState(data, today);
}

async function saveElapsed(elapsed) {
  const date = todayKey();
  const data = await chrome.storage.local.get('watchHistory');
  const watchHistory = data.watchHistory ?? {};
  watchHistory[date] = elapsed;
  await chrome.storage.local.set({ elapsed, watchHistory });
}

// ── tick: called every TICK_INTERVAL_S seconds while YouTube tab is active ──
let lastTickTime = null;

async function onTick() {
  const state = await getState();
  if (!state.tracking || state.limitReached) return;

  const now = Date.now();
  const delta = lastTickTime ? Math.min(now - lastTickTime, TICK_INTERVAL_S * 1500) : TICK_INTERVAL_S * 1000;
  lastTickTime = now;

  const newElapsed = state.elapsed + delta;
  await saveElapsed(newElapsed);

  const remaining = state.effectiveLimitMs - newElapsed;

  // Broadcast to popup
  broadcastUpdate(newElapsed, state.effectiveLimitMs);

  if (remaining <= 0) await hitLimit();
  else await sendWarningsIfNeeded(state, newElapsed);
}

async function sendWarningsIfNeeded(state, elapsed) {
  const data = await chrome.storage.local.get([
    'timerWarn', 'timerWarnMinutes', 'baseWarningDate', 'rolloverWarningDate'
  ]);
  if (!(data.timerWarn ?? true)) return;

  const warningMs = normalizeWarningMinutes(data.timerWarnMinutes) * 60_000;
  let stage;
  let remainingMs;
  let sentKey;

  if (elapsed < state.limitMs) {
    stage = 'daily limit';
    remainingMs = state.limitMs - elapsed;
    sentKey = 'baseWarningDate';
  } else if (state.rolloverBankMs > 0 && elapsed < state.limitMs + state.rolloverBankMs) {
    stage = 'carried-over time';
    remainingMs = state.limitMs + state.rolloverBankMs - elapsed;
    sentKey = 'rolloverWarningDate';
  } else {
    return;
  }

  if (remainingMs > warningMs || data[sentKey] === state.date) return;

  const minutesLeft = Math.ceil(remainingMs / 60_000);
  await chrome.storage.local.set({ [sentKey]: state.date });
  await chrome.notifications.create(`yt_warn_${sentKey}_${state.date}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `⏰ YouTube – ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'} of ${stage} left`,
    message: stage === 'daily limit'
      ? 'Your daily allowance is nearly used up. Carried-over time will start next if available.'
      : 'Your carried-over YouTube time is nearly used up.',
    priority: 1
  });
}

async function hitLimit() {
  await chrome.storage.local.set({ limitReached: true, tracking: false });
  lastTickTime = null;
  chrome.alarms.clear(ALARM_TICK);

  // Notify user
  chrome.notifications.create('yt_limit_notif', {
    type:     'basic',
    iconUrl:  'icons/icon128.png',
    title:    '🚫 YouTube time is up!',
    message:  "Your daily YouTube limit has been reached. The tab will close.",
    priority: 2,
    requireInteraction: true
  });

  broadcastUpdate(null, null, true);
}

function broadcastUpdate(elapsed, limitMs, limitReached = false) {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE', elapsed, limitMs, limitReached
  }).catch(() => {}); // popup may be closed
}

// ── detect active YouTube tab ────────────────────────────────────────────────
async function refreshTracking() {
  const state = await getState();
  if (state.limitReached) {
    chrome.alarms.clear(ALARM_TICK);
    lastTickTime = null;
    return;
  }

  // Find a focused YouTube tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const ytTab = tabs.find(t => t.url && t.url.includes('youtube.com'));

  if (ytTab) {
    if (!state.tracking) {
      lastTickTime = Date.now();
      await chrome.storage.local.set({ tracking: true, ytTabId: ytTab.id });
      const alarm = await chrome.alarms.get(ALARM_TICK);
      if (!alarm) chrome.alarms.create(ALARM_TICK, { periodInMinutes: TICK_INTERVAL_S / 60 });
    }
  } else {
    if (state.tracking) {
      await chrome.storage.local.set({ tracking: false, ytTabId: null });
      lastTickTime = null;
    }
  }
}

// ── extra 5 minutes ──────────────────────────────────────────────────────────
async function grantExtraTime() {
  const state = await getState();
  if (state.extraUsed || !state.limitReached) return { ok: false };

  await chrome.storage.local.set({
    limitReached: false,
    extraUsed:    true,
    tracking:     false
  });
  lastTickTime = Date.now();
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: TICK_INTERVAL_S / 60 });

  // Tell content scripts to restore the page
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  tabs.forEach(t => chrome.tabs.reload(t.id));

  broadcastUpdate(state.elapsed, state.effectiveLimitMs + EXTRA_TIME_MS, false);
  return { ok: true };
}

// ── event listeners ──────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_TICK) await onTick();
});

chrome.tabs.onActivated.addListener(() => refreshTracking());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') refreshTracking();
});
chrome.windows.onFocusChanged.addListener(() => refreshTracking());

chrome.notifications.onClosed.addListener(async (notifId) => {
  if (notifId === 'yt_limit_notif') {
    const data = await chrome.storage.local.get('timerCloseTab');
    const shouldClose = data.timerCloseTab ?? true;
    if (shouldClose) {
      // Close YouTube tabs
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
      tabs.forEach(t => chrome.tabs.remove(t.id));
    }
  }
});

chrome.notifications.onButtonClicked.addListener(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    getState().then(s => sendResponse(s));
    return true;
  }
  if (msg.type === 'GRANT_EXTRA') {
    grantExtraTime().then(r => sendResponse(r));
    return true;
  }
  if (msg.type === 'SET_LIMIT') {
    chrome.storage.local.set({ limitMs: msg.limitMs }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'SET_ROLLOVER') {
    const rolloverEnabled = Boolean(msg.enabled);
    const rolloverDailyCapMs = normalizeRolloverDailyCap(msg.dailyCapMs);
    chrome.storage.local.get('rolloverBankMs').then(data => chrome.storage.local.set({
      rolloverEnabled,
      rolloverDailyCapMs,
      rolloverBankMs: rolloverEnabled ? clampRolloverBank(data.rolloverBankMs) : 0
    })).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'RESET_DAY') {
    const date = todayKey();
    chrome.storage.local.get('watchHistory').then(data => {
      const watchHistory = data.watchHistory ?? {};
      watchHistory[date] = 0;
      return chrome.storage.local.set({
        date, elapsed: 0, limitReached: false, extraUsed: false, tracking: false,
        baseWarningDate: null, rolloverWarningDate: null, watchHistory
      });
    }).then(() => {
      broadcastUpdate(0, null, false);
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'GET_HISTORY') {
    getState().then(async state => {
      const data = await chrome.storage.local.get('watchHistory');
      const history = data.watchHistory ?? {};
      history[state.date] = state.elapsed;
      sendResponse({ history });
    });
    return true;
  }
  if (msg.type === 'SET_SHORTS') {
    chrome.storage.local.set({
      shortsHideSections:  msg.hideSections,
      shortsBlockPlayback: msg.blockPlayback,
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_SHORTS') {
    chrome.storage.local.get(['shortsHideSections', 'shortsBlockPlayback'], data => {
      sendResponse({
        hideSections:  data.shortsHideSections  ?? false,
        blockPlayback: data.shortsBlockPlayback ?? false,
      });
    });
    return true;
  }
});

// Bootstrap on install / browser start
chrome.runtime.onStartup.addListener(() => refreshTracking());
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['limitMs', 'rolloverDailyCapMs']).then(d => {
    const defaults = {};
    if (!d.limitMs) defaults.limitMs = DAILY_LIMIT_MS;
    if (!d.rolloverDailyCapMs) defaults.rolloverDailyCapMs = DEFAULT_ROLLOVER_DAILY_CAP_MS;
    if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
  });
  refreshTracking();
});
