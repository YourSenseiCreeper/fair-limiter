// Pure timer rules. Browser APIs and persistence belong to the services that use them.
((root) => {
  const DAILY_LIMIT_MS = 60 * 60 * 1000;
  const EXTRA_TIME_MS = 5 * 60 * 1000;
  const DEFAULT_ROLLOVER_DAILY_CAP_MS = 30 * 60 * 1000;
  const MAX_ROLLOVER_BANK_MS = 90 * 60 * 1000;
  // JavaScript weekdays: Sunday = 0, Monday = 1, ..., Saturday = 6.
  const DEFAULT_ROLLOVER_DAYS = Object.freeze([1, 2, 3, 4, 5]);

  function todayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
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

  function normalizeRolloverDays(value) {
    if (!Array.isArray(value)) return [...DEFAULT_ROLLOVER_DAYS];
    return [...new Set(value.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))];
  }

  function dayNumber(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '');
    if (!match) return null;
    return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
  }

  function rolloverForNewDay(data, today) {
    if (!(data.rolloverEnabled ?? false) || !data.date) return 0;

    const limitMs = Number.isFinite(data.limitMs) ? data.limitMs : DAILY_LIMIT_MS;
    const elapsed = Math.max(0, Number(data.elapsed) || 0);
    const dailyCap = normalizeRolloverDailyCap(data.rolloverDailyCapMs);
    const currentBank = clampRolloverBank(data.rolloverBankMs);
    const bankUsed = Math.min(currentBank, Math.max(0, elapsed - limitMs));
    const unusedDailyLimit = Math.max(0, limitMs - elapsed);
    const rolloverDays = normalizeRolloverDays(data.rolloverDays);
    const previousDay = dayNumber(data.date);
    const currentDay = dayNumber(today);
    const weekday = day => ((day + 4) % 7 + 7) % 7;
    let nextBank = currentBank - bankUsed;
    if (previousDay !== null && rolloverDays.includes(weekday(previousDay))) {
      nextBank += Math.min(unusedDailyLimit, dailyCap);
    }

    if (previousDay !== null && currentDay !== null && currentDay > previousDay + 1) {
      const missedDays = currentDay - previousDay - 1;
      let eligibleDays = Math.floor(missedDays / 7) * rolloverDays.length;
      for (let offset = 1; offset <= missedDays % 7; offset++) {
        if (rolloverDays.includes(weekday(previousDay + offset))) eligibleDays++;
      }
      nextBank += eligibleDays * Math.min(limitMs, dailyCap);
    }
    return clampRolloverBank(nextBank);
  }

  function buildState(data, today) {
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
      rolloverDays: normalizeRolloverDays(data.rolloverDays),
      rolloverBankMs,
      rolloverRemainingMs,
      limitReached: elapsed >= effectiveLimitMs,
      extraUsed: data.extraUsed ?? false,
      tracking: data.tracking ?? false,
      ytTabId: data.ytTabId ?? null
    };
  }

  function warningCandidate(state, elapsed, minutes) {
    const warningMs = normalizeWarningMinutes(minutes) * 60_000;
    if (elapsed < state.limitMs) {
      const remainingMs = state.limitMs - elapsed;
      return remainingMs <= warningMs
        ? { sentKey: 'baseWarningDate', stage: 'daily limit', remainingMs } : null;
    }
    if (state.rolloverBankMs > 0 && elapsed > state.limitMs
        && elapsed < state.limitMs + state.rolloverBankMs) {
      const remainingMs = state.limitMs + state.rolloverBankMs - elapsed;
      return remainingMs <= warningMs
        ? { sentKey: 'rolloverWarningDate', stage: 'carried-over time', remainingMs } : null;
    }
    return null;
  }

  root.YtLimiterTime = Object.freeze({
    DAILY_LIMIT_MS,
    EXTRA_TIME_MS,
    DEFAULT_ROLLOVER_DAILY_CAP_MS,
    MAX_ROLLOVER_BANK_MS,
    DEFAULT_ROLLOVER_DAYS,
    todayKey,
    clampRolloverBank,
    normalizeRolloverDailyCap,
    normalizeRolloverDays,
    normalizeWarningMinutes,
    rolloverForNewDay,
    buildState,
    warningCandidate
  });
})(globalThis);
