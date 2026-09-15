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
    rolloverDailyCapMs: 30 * minute
  });

  const state = await worker.call('getState');
  assert.equal(state.rolloverBankMs, 90 * minute);
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
    type: 'SET_ROLLOVER', enabled: true, dailyCapMs: 120 * minute
  });
  assert.equal(rollover.ok, true);
  assert.equal(worker.store.rolloverBankMs, 90 * minute);
  assert.equal(worker.store.rolloverDailyCapMs, 90 * minute);

  await worker.request({ type: 'SET_ROLLOVER', enabled: false, dailyCapMs: 1 * minute });
  assert.equal(worker.store.rolloverBankMs, 0);
  assert.equal(worker.store.rolloverDailyCapMs, 5 * minute);

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
