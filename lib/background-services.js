// Small services depend on the browser capabilities they actually use.
((root) => {
  function createTickClock(now, intervalSeconds) {
    let lastTick = null;
    return {
      start() { lastTick = now(); },
      reset() { lastTick = null; },
      delta() {
        const current = now();
        const delta = lastTick === null ? intervalSeconds * 1000
          : Math.max(0, Math.min(current - lastTick, intervalSeconds * 1500));
        lastTick = current;
        return delta;
      }
    };
  }

  function createHistoryRepository(storage, dateNow, dateKey) {
    async function read() {
      const data = await storage.get('watchHistory');
      return data.watchHistory ?? {};
    }

    return {
      async recordPrior(date, elapsed) {
        const history = await read();
        history[date] = Math.max(0, elapsed);
        const cutoff = dateNow();
        cutoff.setDate(cutoff.getDate() - 365);
        const cutoffKey = dateKey(cutoff);
        Object.keys(history).forEach(key => { if (key < cutoffKey) delete history[key]; });
        await storage.set({ watchHistory: history });
      },
      async saveCurrent(date, elapsed) {
        const history = await read();
        history[date] = elapsed;
        await storage.set({ elapsed, watchHistory: history });
      },
      async withCurrent(date, elapsed) {
        const history = await read();
        history[date] = elapsed;
        return history;
      },
      async resetCurrent(date) {
        const history = await read();
        history[date] = 0;
        return history;
      }
    };
  }

  function createStateRepository(storage, time, history, dateNow) {
    const stateKeys = [
      'date', 'elapsed', 'limitMs', 'limitReached',
      'extraUsed', 'tracking', 'ytTabId', 'rolloverEnabled',
      'rolloverDailyCapMs', 'rolloverBankMs', 'rolloverDays'
    ];

    async function getState() {
      const data = await storage.get(stateKeys);
      const today = time.todayKey(dateNow());
      if (data.date !== today) {
        if (data.date && Number.isFinite(data.elapsed)) {
          await history.recordPrior(data.date, data.elapsed);
        }
        const nextData = {
          ...data,
          date: today,
          elapsed: 0,
          limitReached: false,
          extraUsed: false,
          tracking: data.tracking ?? false,
          ytTabId: data.ytTabId ?? null,
          rolloverBankMs: time.rolloverForNewDay(data, today)
        };
        await storage.set(nextData);
        return time.buildState(nextData, today);
      }
      return time.buildState(data, today);
    }

    return {
      getState,
      async saveElapsed(elapsed) {
        await history.saveCurrent(time.todayKey(dateNow()), elapsed);
      },
      async setTracking(tracking, ytTabId) {
        await storage.set({ tracking, ytTabId });
      },
      async markLimitReached() {
        await storage.set({ limitReached: true, tracking: false });
      },
      async grantExtra() {
        await storage.set({ limitReached: false, extraUsed: true, tracking: false });
      },
      async resetDay() {
        const date = time.todayKey(dateNow());
        const watchHistory = await history.resetCurrent(date);
        await storage.set({
          date, elapsed: 0, limitReached: false, extraUsed: false, tracking: false,
          baseWarningDate: null, rolloverWarningDate: null,
          rolloverStartDate: null, watchHistory
        });
      },
      async getHistory() {
        const state = await getState();
        return history.withCurrent(state.date, state.elapsed);
      }
    };
  }

  function createSettingsRepository(storage, time) {
    return {
      async setLimit(limitMs) { await storage.set({ limitMs }); },
      async setRollover(enabled, dailyCapMs, days) {
        const data = await storage.get(['rolloverBankMs', 'rolloverDays']);
        const rolloverEnabled = Boolean(enabled);
        await storage.set({
          rolloverEnabled,
          rolloverDailyCapMs: time.normalizeRolloverDailyCap(dailyCapMs),
          rolloverDays: time.normalizeRolloverDays(days === undefined ? data.rolloverDays : days),
          rolloverBankMs: rolloverEnabled ? time.clampRolloverBank(data.rolloverBankMs) : 0
        });
      },
      async getShorts() {
        const data = await storage.get(['shortsHideSections', 'shortsBlockPlayback']);
        return {
          hideSections: data.shortsHideSections ?? false,
          blockPlayback: data.shortsBlockPlayback ?? false
        };
      },
      async setShorts(hideSections, blockPlayback) {
        await storage.set({ shortsHideSections: hideSections, shortsBlockPlayback: blockPlayback });
      },
      async ensureDefaults() {
        const data = await storage.get(['limitMs', 'rolloverDailyCapMs', 'rolloverDays']);
        const defaults = {};
        if (!data.limitMs) defaults.limitMs = time.DAILY_LIMIT_MS;
        if (!data.rolloverDailyCapMs) defaults.rolloverDailyCapMs = time.DEFAULT_ROLLOVER_DAILY_CAP_MS;
        if (!Array.isArray(data.rolloverDays)) defaults.rolloverDays = [...time.DEFAULT_ROLLOVER_DAYS];
        if (Object.keys(defaults).length) await storage.set(defaults);
      }
    };
  }

  function createNotificationService(storage, notifications, tabs, time) {
    return {
      async warnIfNeeded(state, elapsed) {
        const data = await storage.get([
          'timerWarn', 'timerWarnMinutes', 'baseWarningDate',
          'rolloverWarningDate', 'rolloverStartDate'
        ]);
        if (!(data.timerWarn ?? true)) return;
        if (state.rolloverBankMs > 0 && state.elapsed <= state.limitMs
            && elapsed > state.limitMs && elapsed < state.limitMs + state.rolloverBankMs
            && data.rolloverStartDate !== state.date) {
          const remainingMs = state.limitMs + state.rolloverBankMs - elapsed;
          const minutesLeft = Math.ceil(remainingMs / 60_000);
          const update = { rolloverStartDate: state.date };
          if (remainingMs <= time.normalizeWarningMinutes(data.timerWarnMinutes) * 60_000) {
            update.rolloverWarningDate = state.date;
          }
          await storage.set(update);
          await notifications.create(`yt_rollover_start_${state.date}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'YouTube - using saved time',
            message: `Your daily limit has been reached. ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'} remain in your saved-time bank.`,
            priority: 1
          });
          return;
        }
        const candidate = time.warningCandidate(state, elapsed, data.timerWarnMinutes);
        if (!candidate || data[candidate.sentKey] === state.date) return;

        const minutesLeft = Math.ceil(candidate.remainingMs / 60_000);
        await storage.set({ [candidate.sentKey]: state.date });
        await notifications.create(`yt_warn_${candidate.sentKey}_${state.date}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `⏰ YouTube – ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'} of ${candidate.stage} left`,
          message: candidate.stage === 'daily limit'
            ? 'Your daily allowance is nearly used up. Carried-over time will start next if available.'
            : 'Your carried-over YouTube time is nearly used up.',
          priority: 1
        });
      },
      async limitReached() {
        await notifications.create('yt_limit_notif', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🚫 YouTube time is up!',
          message: 'Your daily YouTube limit has been reached. The tab will close.',
          priority: 2,
          requireInteraction: true
        });
      },
      async handleClosed(id) {
        if (id !== 'yt_limit_notif') return;
        const data = await storage.get('timerCloseTab');
        if (!(data.timerCloseTab ?? true)) return;
        const youtubeTabs = await tabs.query({ url: '*://*.youtube.com/*' });
        youtubeTabs.forEach(tab => tabs.remove(tab.id));
      }
    };
  }

  function createTimerController(stateRepository, notifier, tickClock, tabs, alarms, runtime, time, intervalSeconds) {
    const alarmName = 'yt_tick';
    function isYoutubeTab(tab) {
      if (!tab.url) return false;
      try {
        const url = new URL(tab.url);
        return (url.protocol === 'http:' || url.protocol === 'https:')
          && (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com'));
      } catch {
        return false;
      }
    }

    function broadcast(elapsed, limitMs, limitReached = false) {
      runtime.sendMessage({ type: 'STATE_UPDATE', elapsed, limitMs, limitReached }).catch(() => {});
    }

    async function hitLimit() {
      await stateRepository.markLimitReached();
      tickClock.reset();
      alarms.clear(alarmName);
      await notifier.limitReached();
      broadcast(null, null, true);
    }

    return {
      async onTick() {
        const state = await stateRepository.getState();
        if (!state.tracking || state.limitReached) return;
        const elapsed = state.elapsed + tickClock.delta();
        await stateRepository.saveElapsed(elapsed);
        broadcast(elapsed, state.effectiveLimitMs);
        if (state.effectiveLimitMs - elapsed <= 0) await hitLimit();
        else await notifier.warnIfNeeded(state, elapsed);
      },
      async refreshTracking() {
        const state = await stateRepository.getState();
        if (state.limitReached) {
          alarms.clear(alarmName);
          tickClock.reset();
          return;
        }
        const activeTabs = await tabs.query({ active: true, currentWindow: true });
        const youtubeTab = activeTabs.find(isYoutubeTab);
        if (youtubeTab && !state.tracking) {
          tickClock.start();
          await stateRepository.setTracking(true, youtubeTab.id);
          if (!(await alarms.get(alarmName))) {
            alarms.create(alarmName, { periodInMinutes: intervalSeconds / 60 });
          }
        } else if (!youtubeTab && state.tracking) {
          await stateRepository.setTracking(false, null);
          tickClock.reset();
        }
      },
      async grantExtraTime() {
        const state = await stateRepository.getState();
        if (state.extraUsed || !state.limitReached) return { ok: false };
        await stateRepository.grantExtra();
        tickClock.start();
        alarms.create(alarmName, { periodInMinutes: intervalSeconds / 60 });
        const youtubeTabs = await tabs.query({ url: '*://*.youtube.com/*' });
        youtubeTabs.forEach(tab => tabs.reload(tab.id));
        broadcast(state.elapsed, state.effectiveLimitMs + time.EXTRA_TIME_MS, false);
        return { ok: true };
      },
      async resetDay() {
        await stateRepository.resetDay();
        broadcast(0, null, false);
        return { ok: true };
      }
    };
  }

  root.YtLimiterServices = Object.freeze({
    createTickClock,
    createHistoryRepository,
    createStateRepository,
    createSettingsRepository,
    createNotificationService,
    createTimerController
  });
})(globalThis);
