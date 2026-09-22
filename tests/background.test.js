const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundWorker } = require('./helpers/background-worker');

const minute = 60_000;

test('new day resets the timer, preserves history, and banks only unused daily time', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-14',
    elapsed: 20 * minute,
    limitMs: 60 * minute,
    extraUsed: true,
    limitReached: true,
    rolloverEnabled: true,
    rolloverDailyCapMs: 30 * minute,
    rolloverBankMs: 0,
    watchHistory: { '2026-09-13': 12 * minute }
  });

  const state = await worker.call('getState');
  assert.equal(state.date, '2026-09-15');
  assert.equal(state.elapsed, 0);
  assert.equal(state.extraUsed, false);
  assert.equal(state.limitReached, false);
  assert.equal(state.rolloverBankMs, 30 * minute);
  assert.equal(worker.store.watchHistory['2026-09-14'], 20 * minute);
  assert.equal(worker.store.watchHistory['2026-09-13'], 12 * minute);
});

test('using carried-over time spends the bank without adding unused daily time', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-14',
    elapsed: 75 * minute,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 30 * minute,
    rolloverDailyCapMs: 30 * minute
  });

  const state = await worker.call('getState');
  assert.equal(state.rolloverBankMs, 15 * minute);
  assert.equal(state.effectiveLimitMs, 75 * minute);
});

test('missed days add their capped allowance without exceeding the bank maximum', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-11',
    elapsed: 0,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 0,
    rolloverDailyCapMs: 30 * minute,
    rolloverDays: [0, 1, 2, 3, 4, 5, 6]
  });

  const state = await worker.call('getState');
  assert.equal(state.rolloverBankMs, 90 * minute);
});

test('a fully spent Friday bank stays empty on Monday with weekday rollover', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-18', elapsed: 150 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 90 * minute,
    rolloverDailyCapMs: 30 * minute
  }, { now: new Date(2026, 8, 21, 12).getTime() });

  const state = await worker.call('getState');
  assert.equal(state.rolloverBankMs, 0);
  assert.equal(state.rolloverRemainingMs, 0);
  assert.equal(state.effectiveLimitMs, 60 * minute);
  assert.deepEqual(Array.from(state.rolloverDays), [1, 2, 3, 4, 5]);
});

test('Friday contributes its unused time, but unselected weekend days do not', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-18', elapsed: 35 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 0,
    rolloverDailyCapMs: 30 * minute,
    rolloverDays: [1, 2, 3, 4, 5]
  }, { now: new Date(2026, 8, 21, 12).getTime() });

  assert.equal((await worker.call('getState')).rolloverBankMs, 25 * minute);
});

test('selected weekend day contributes during a gap while excluded Friday does not', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-18', elapsed: 0, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 0,
    rolloverDailyCapMs: 30 * minute,
    rolloverDays: [6]
  }, { now: new Date(2026, 8, 21, 12).getTime() });

  assert.equal((await worker.call('getState')).rolloverBankMs, 30 * minute);
});

test('a longer gap counts only the selected weekday in each week', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-18', elapsed: 60 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 0,
    rolloverDailyCapMs: 30 * minute,
    rolloverDays: [6]
  }, { now: new Date(2026, 8, 28, 12).getTime() });

  assert.equal((await worker.call('getState')).rolloverBankMs, 60 * minute);
});

test('an empty day selection never adds time and still deducts spent bank time', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-18', elapsed: 75 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 30 * minute,
    rolloverDailyCapMs: 30 * minute,
    rolloverDays: []
  }, { now: new Date(2026, 8, 21, 12).getTime() });

  assert.equal((await worker.call('getState')).rolloverBankMs, 15 * minute);
});

test('a missed leap day contributes one capped allowance', async () => {
  const worker = createBackgroundWorker({
    date: '2024-02-28', elapsed: 60 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverDailyCapMs: 30 * minute,
    rolloverBankMs: 0
  }, { now: new Date(2024, 2, 1, 12).getTime() });

  const state = await worker.call('getState');
  assert.equal(state.date, '2024-03-01');
  assert.equal(state.rolloverBankMs, 30 * minute);
  assert.equal(worker.store.watchHistory['2024-02-28'], 60 * minute);
});

test('history keeps the 365-day boundary and removes older entries on day change', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-14', elapsed: 10 * minute,
    watchHistory: {
      '2025-09-14': 1 * minute,
      '2025-09-15': 2 * minute,
      '2026-09-13': 3 * minute
    }
  });

  await worker.call('getState');
  assert.equal('2025-09-14' in worker.store.watchHistory, false);
  assert.equal(worker.store.watchHistory['2025-09-15'], 2 * minute);
  assert.equal(worker.store.watchHistory['2026-09-13'], 3 * minute);
  assert.equal(worker.store.watchHistory['2026-09-14'], 10 * minute);
});

test('disabled rollover discards an existing bank on the next day', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-14',
    elapsed: 0,
    limitMs: 60 * minute,
    rolloverEnabled: false,
    rolloverBankMs: 50 * minute
  });

  const state = await worker.call('getState');
  assert.equal(state.rolloverBankMs, 0);
  assert.equal(state.effectiveLimitMs, 60 * minute);
});

test('state spends the daily allowance before rollover and includes one grace period', () => {
  const worker = createBackgroundWorker();
  const beforeBank = worker.call('buildState', {
    elapsed: 55 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 30 * minute
  });
  assert.equal(beforeBank.rolloverRemainingMs, 30 * minute);

  const duringBank = worker.call('buildState', {
    elapsed: 80 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 30 * minute
  });
  assert.equal(duringBank.rolloverRemainingMs, 10 * minute);
  assert.equal(duringBank.effectiveLimitMs, 90 * minute);
  assert.equal(duringBank.limitReached, false);

  const grace = worker.call('buildState', {
    elapsed: 90 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 30 * minute, extraUsed: true
  });
  assert.equal(grace.rolloverRemainingMs, 0);
  assert.equal(grace.effectiveLimitMs, 95 * minute);
  assert.equal(grace.limitReached, false);

  const exhausted = worker.call('buildState', {
    elapsed: 95 * minute, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 30 * minute, extraUsed: true
  });
  assert.equal(exhausted.limitReached, true);
});

test('tracking starts for an active YouTube tab and stops counting after switching away', async () => {
  const worker = createBackgroundWorker({ elapsed: 0, limitMs: 60 * minute });
  worker.setActiveTabs([{ id: 7, url: 'https://www.youtube.com/watch?v=abc' }]);
  await worker.call('refreshTracking');
  assert.equal(worker.store.tracking, true);
  assert.equal(worker.store.ytTabId, 7);
  assert.equal(worker.alarms.has('yt_tick'), true);

  worker.setNow(new Date(2026, 8, 15, 12, 0, 10));
  await worker.call('onTick');
  assert.equal(worker.store.elapsed, 10_000);
  assert.equal(worker.store.watchHistory['2026-09-15'], 10_000);

  worker.setActiveTabs([{ id: 8, url: 'https://example.com/' }]);
  await worker.call('refreshTracking');
  assert.equal(worker.store.tracking, false);
  await worker.call('onTick');
  assert.equal(worker.store.elapsed, 10_000);
});

test('a delayed alarm can add at most fifteen seconds', async () => {
  const worker = createBackgroundWorker({
    elapsed: 0, limitMs: 60 * minute, tracking: true
  });
  worker.setLastTickAge(100_000);
  await worker.call('onTick');
  assert.equal(worker.store.elapsed, 15_000);
});

test('resuming YouTube after a long pause does not count the paused interval', async () => {
  const worker = createBackgroundWorker({ elapsed: 0, limitMs: 60 * minute });
  worker.setActiveTabs([{ id: 7, url: 'https://www.youtube.com/watch?v=abc' }]);
  await worker.call('refreshTracking');
  worker.setNow(new Date(2026, 8, 15, 12, 0, 10));
  await worker.call('onTick');

  worker.setActiveTabs([{ id: 8, url: 'https://example.com/' }]);
  await worker.call('refreshTracking');
  worker.setNow(new Date(2026, 8, 15, 12, 30));
  worker.setActiveTabs([{ id: 9, url: 'https://m.youtube.com/watch?v=xyz' }]);
  await worker.call('refreshTracking');
  worker.setNow(new Date(2026, 8, 15, 12, 30, 10));
  await worker.call('onTick');

  assert.equal(worker.store.elapsed, 20_000);
  assert.equal(worker.store.ytTabId, 9);
});

test('a backward clock adjustment cannot reduce elapsed watch time', async () => {
  const worker = createBackgroundWorker({
    elapsed: 5 * minute, limitMs: 60 * minute, tracking: true
  });
  worker.setLastTickAge(-20_000);
  await worker.call('onTick');
  assert.equal(worker.store.elapsed, 5 * minute);
  worker.setNow(new Date(2026, 8, 15, 12, 0, 10));
  await worker.call('onTick');
  assert.equal(worker.store.elapsed, 5 * minute + 10_000);
});

test('a lookalike domain does not start YouTube tracking', async () => {
  const worker = createBackgroundWorker({ elapsed: 0, limitMs: 60 * minute });
  worker.setActiveTabs([
    { id: 7, url: 'https://www.youtube.com.evil.example/watch?v=abc' },
    { id: 8, url: 'not a valid URL' }
  ]);
  await worker.call('refreshTracking');
  assert.equal(worker.store.tracking, undefined);
  assert.equal(worker.alarms.has('yt_tick'), false);
});

test('installation sets missing defaults without replacing existing limits', async () => {
  const fresh = createBackgroundWorker();
  await fresh.events.installed.emit();
  assert.equal(fresh.store.limitMs, 60 * minute);
  assert.equal(fresh.store.rolloverDailyCapMs, 30 * minute);
  assert.deepEqual(Array.from(fresh.store.rolloverDays), [1, 2, 3, 4, 5]);

  const configured = createBackgroundWorker({
    limitMs: 90 * minute, rolloverDailyCapMs: 15 * minute, rolloverDays: [0, 6]
  });
  await configured.events.installed.emit();
  assert.equal(configured.store.limitMs, 90 * minute);
  assert.equal(configured.store.rolloverDailyCapMs, 15 * minute);
  assert.deepEqual(Array.from(configured.store.rolloverDays), [0, 6]);
});

test('reaching the effective limit stops tracking and sends one blocking notification', async () => {
  const worker = createBackgroundWorker({
    elapsed: 0, limitMs: 60 * minute,
    rolloverEnabled: true, rolloverBankMs: 30 * minute,
    tracking: true
  });
  worker.alarms.set('yt_tick', { periodInMinutes: 1 / 6 });
  await worker.tickAt(90 * minute);
  assert.equal(worker.store.limitReached, true);
  assert.equal(worker.store.tracking, false);
  assert.equal(worker.alarms.has('yt_tick'), false);
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].id, 'yt_limit_notif');
  assert.equal(worker.notifications[0].requireInteraction, true);

  await worker.call('onTick');
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.store.elapsed, 90 * minute);
});

test('grace period extends the reached limit once and reloads YouTube tabs', async () => {
  const worker = createBackgroundWorker({
    elapsed: 90 * minute,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 30 * minute,
    extraUsed: false
  });
  worker.setYoutubeTabs([{ id: 4 }, { id: 9 }]);

  const first = await worker.call('grantExtraTime');
  assert.equal(first.ok, true);
  assert.equal(worker.store.extraUsed, true);
  assert.equal(worker.store.limitReached, false);
  assert.equal((await worker.call('getState')).effectiveLimitMs, 95 * minute);
  assert.deepEqual(worker.reloadedTabs, [4, 9]);
  assert.equal(worker.alarms.has('yt_tick'), true);

  const second = await worker.call('grantExtraTime');
  assert.equal(second.ok, false);
  assert.deepEqual(worker.reloadedTabs, [4, 9]);
});

test('dismissing the limit notice closes tabs only when the setting allows it', async () => {
  const worker = createBackgroundWorker();
  worker.setYoutubeTabs([{ id: 2 }, { id: 3 }]);
  await worker.events.notificationClosed.emit('yt_warn_baseWarningDate_2026-09-15');
  assert.deepEqual(worker.removedTabs, []);

  await worker.events.notificationClosed.emit('yt_limit_notif');
  assert.deepEqual(worker.removedTabs, [2, 3]);

  worker.store.timerCloseTab = false;
  await worker.events.notificationClosed.emit('yt_limit_notif');
  assert.deepEqual(worker.removedTabs, [2, 3]);
});

test('settings messages clamp rollover and persist Shorts options', async () => {
  const worker = createBackgroundWorker({ rolloverBankMs: 120 * minute });
  const rollover = await worker.request({
    type: 'SET_ROLLOVER', enabled: true, dailyCapMs: 120 * minute,
    days: [0, 6, 6, -1, 7, '1']
  });
  assert.equal(rollover.ok, true);
  assert.equal(worker.store.rolloverBankMs, 90 * minute);
  assert.equal(worker.store.rolloverDailyCapMs, 90 * minute);
  assert.deepEqual(Array.from(worker.store.rolloverDays), [0, 6]);

  await worker.request({ type: 'SET_ROLLOVER', enabled: false, dailyCapMs: 1 * minute });
  assert.equal(worker.store.rolloverBankMs, 0);
  assert.equal(worker.store.rolloverDailyCapMs, 5 * minute);
  assert.deepEqual(Array.from(worker.store.rolloverDays), [0, 6]);

  const defaults = await worker.request({ type: 'GET_SHORTS' });
  assert.equal(defaults.hideSections, false);
  assert.equal(defaults.blockPlayback, false);
  await worker.request({ type: 'SET_SHORTS', hideSections: true, blockPlayback: false });
  const saved = await worker.request({ type: 'GET_SHORTS' });
  assert.equal(saved.hideSections, true);
  assert.equal(saved.blockPlayback, false);
});

test('history response includes the current day alongside saved days', async () => {
  const worker = createBackgroundWorker({
    elapsed: 20 * minute,
    watchHistory: { '2026-09-14': 10 * minute }
  });
  const response = await worker.request({ type: 'GET_HISTORY' });
  assert.equal(response.history['2026-09-14'], 10 * minute);
  assert.equal(response.history['2026-09-15'], 20 * minute);
});
