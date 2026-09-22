// Composition root for the extension service worker.
importScripts('lib/time-domain.js', 'lib/background-services.js');

const time = YtLimiterTime;
const services = YtLimiterServices;
const tickIntervalSeconds = 10;
const storage = {
  get(keys) { return chrome.storage.local.get(keys); },
  set(values) { return chrome.storage.local.set(values); }
};
const dateNow = () => new Date();
const historyRepository = services.createHistoryRepository(storage, dateNow, time.todayKey);
const stateRepository = services.createStateRepository(storage, time, historyRepository, dateNow);
const settingsRepository = services.createSettingsRepository(storage, time);
const notifier = services.createNotificationService(storage, chrome.notifications, chrome.tabs, time);
const tickClock = services.createTickClock(() => Date.now(), tickIntervalSeconds);
const timer = services.createTimerController(
  stateRepository, notifier, tickClock, chrome.tabs, chrome.alarms,
  chrome.runtime, time, tickIntervalSeconds
);

const messageHandlers = Object.freeze({
  GET_STATE: () => stateRepository.getState(),
  GRANT_EXTRA: () => timer.grantExtraTime(),
  SET_LIMIT: async msg => {
    await settingsRepository.setLimit(msg.limitMs);
    return { ok: true };
  },
  SET_ROLLOVER: async msg => {
    await settingsRepository.setRollover(msg.enabled, msg.dailyCapMs, msg.days);
    return { ok: true };
  },
  RESET_DAY: () => timer.resetDay(),
  GET_HISTORY: async () => ({ history: await stateRepository.getHistory() }),
  SET_SHORTS: async msg => {
    await settingsRepository.setShorts(msg.hideSections, msg.blockPlayback);
    return { ok: true };
  },
  GET_SHORTS: () => settingsRepository.getShorts()
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (!handler) return false;
  Promise.resolve().then(() => handler(message)).then(sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'yt_tick') return timer.onTick();
});
chrome.tabs.onActivated.addListener(() => timer.refreshTracking());
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === 'complete') return timer.refreshTracking();
});
chrome.windows.onFocusChanged.addListener(() => timer.refreshTracking());
chrome.notifications.onClosed.addListener(id => notifier.handleClosed(id));
chrome.runtime.onStartup.addListener(() => timer.refreshTracking());
chrome.runtime.onInstalled.addListener(async () => {
  await settingsRepository.ensureDefaults();
  await timer.refreshTracking();
});
