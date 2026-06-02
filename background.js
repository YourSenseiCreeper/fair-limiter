// ── constants ────────────────────────────────────────────────────────────────
const DAILY_LIMIT_MS   = 60 * 60 * 1000;   // 1 hour default (user-configurable)
const EXTRA_TIME_MS    = 5  * 60 * 1000;   // 5 minutes bonus
const TICK_INTERVAL_S  = 10;               // how often we persist elapsed time
const ALARM_TICK       = 'yt_tick';
const ALARM_WARN       = 'yt_warn';        // 1-min warning

// ── helpers ──────────────────────────────────────────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2025-06-01"
}

async function getState() {
  const data = await chrome.storage.local.get([
    'date', 'elapsed', 'limitMs', 'limitReached',
    'extraUsed', 'tracking', 'ytTabId'
  ]);
  const today = todayKey();
  // Reset elapsed if it's a new day
  if (data.date !== today) {
    await chrome.storage.local.set({
      date: today,
      elapsed: 0,
      limitReached: false,
      extraUsed: false,
      tracking: false
    });
    return { date: today, elapsed: 0, limitMs: data.limitMs ?? DAILY_LIMIT_MS,
             limitReached: false, extraUsed: false, tracking: false, ytTabId: null };
  }
  return {
    date:         today,
    elapsed:      data.elapsed      ?? 0,
    limitMs:      data.limitMs      ?? DAILY_LIMIT_MS,
    limitReached: data.limitReached ?? false,
    extraUsed:    data.extraUsed    ?? false,
    tracking:     data.tracking     ?? false,
    ytTabId:      data.ytTabId      ?? null
  };
}

async function saveElapsed(elapsed) {
  await chrome.storage.local.set({ elapsed });
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

  const remaining = state.limitMs - newElapsed;

  // Broadcast to popup
  broadcastUpdate(newElapsed, state.limitMs);

  if (remaining <= 0) {
    await hitLimit();
  } else if (remaining <= 60_000) {
    // 1 min warning notification
    await scheduleWarnIfNeeded();
  }
}

async function scheduleWarnIfNeeded() {
  const existing = await chrome.alarms.get(ALARM_WARN);
  if (!existing) {
    chrome.notifications.create('yt_warn_notif', {
      type:    'basic',
      iconUrl: 'icons/icon128.png',
      title:   '⏰ YouTube – 1 minute left',
      message: 'You have about 1 minute of YouTube time remaining today.',
      priority: 1
    });
  }
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

  const newLimit = state.limitMs + EXTRA_TIME_MS;
  await chrome.storage.local.set({
    limitMs:      newLimit,
    limitReached: false,
    extraUsed:    true,
    tracking:     false
  });
  lastTickTime = Date.now();
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: TICK_INTERVAL_S / 60 });

  // Tell content scripts to restore the page
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  tabs.forEach(t => chrome.tabs.reload(t.id));

  broadcastUpdate(state.elapsed, newLimit, false);
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
    // Close YouTube tabs
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    tabs.forEach(t => chrome.tabs.remove(t.id));
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
  if (msg.type === 'RESET_DAY') {
    chrome.storage.local.set({
      date: todayKey(), elapsed: 0, limitReached: false, extraUsed: false, tracking: false
    }).then(() => {
      broadcastUpdate(0, null, false);
      sendResponse({ ok: true });
    });
    return true;
  }
});

// Bootstrap on install / browser start
chrome.runtime.onStartup.addListener(() => refreshTracking());
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('limitMs').then(d => {
    if (!d.limitMs) chrome.storage.local.set({ limitMs: DAILY_LIMIT_MS });
  });
  refreshTracking();
});
