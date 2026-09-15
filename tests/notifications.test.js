const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundWorker } = require('./helpers/background-worker');
const minute = 60_000;

test('warns once before the daily limit and once before carried-over time ends', async () => {
  const worker = createBackgroundWorker({
    tracking: true,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 30 * minute,
    timerWarnMinutes: 10
  });

  await worker.tickAt(49 * minute);
  assert.equal(worker.notifications.length, 0);
  await worker.tickAt(50 * minute);
  await worker.tickAt(51 * minute);
  await worker.tickAt(79 * minute);
  assert.equal(worker.notifications.length, 1);
  assert.match(worker.notifications[0].title, /daily limit/);

  await worker.tickAt(80 * minute);
  await worker.tickAt(81 * minute);
  assert.equal(worker.notifications.length, 2);
  assert.match(worker.notifications[1].title, /carried-over time/);
  assert.notEqual(worker.notifications[0].id, worker.notifications[1].id);
});

test('warns at the start of a short carried-over allowance', async () => {
  const worker = createBackgroundWorker({
    tracking: true,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 5 * minute,
    timerWarnMinutes: 15
  });

  await worker.tickAt(45 * minute);
  await worker.tickAt(60 * minute);
  assert.equal(worker.notifications.length, 2);
  assert.match(worker.notifications[1].title, /5 minutes of carried-over time left/);
});

test('respects the warning toggle and does not add a rollover warning without rollover', async () => {
  const disabled = createBackgroundWorker({
    tracking: true,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 30 * minute,
    timerWarnMinutes: 10,
    timerWarn: false
  });
  await disabled.tickAt(50 * minute);
  await disabled.tickAt(80 * minute);
  assert.equal(disabled.notifications.length, 0);

  const noRollover = createBackgroundWorker({ tracking: true, limitMs: 60 * minute });
  await noRollover.tickAt(58 * minute);
  assert.equal(noRollover.notifications.length, 0);
  await noRollover.tickAt(59 * minute);
  assert.equal(noRollover.notifications.length, 1);
  assert.match(noRollover.notifications[0].title, /daily limit/);
});

test('does not repeat a warning after the service worker restarts', async () => {
  const store = {
    tracking: true,
    limitMs: 60 * minute,
    rolloverEnabled: true,
    rolloverBankMs: 30 * minute,
    timerWarnMinutes: 10
  };
  const first = createBackgroundWorker(store);
  await first.tickAt(50 * minute);
  assert.equal(first.notifications.length, 1);

  const restarted = createBackgroundWorker(store);
  await restarted.tickAt(51 * minute);
  assert.equal(restarted.notifications.length, 0);
  await restarted.tickAt(80 * minute);
  assert.equal(restarted.notifications.length, 1);
  assert.match(restarted.notifications[0].title, /carried-over time/);
});

test('warning lead time is clamped to one or fifteen minutes', async () => {
  for (const { setting, outside, boundary, title } of [
    { setting: 0, outside: 58, boundary: 59, title: /1 minute of daily limit left/ },
    { setting: 99, outside: 44, boundary: 45, title: /15 minutes of daily limit left/ },
    { setting: 'invalid', outside: 58, boundary: 59, title: /1 minute of daily limit left/ }
  ]) {
    const worker = createBackgroundWorker({
      tracking: true, limitMs: 60 * minute, timerWarnMinutes: setting
    });
    await worker.tickAt(outside * minute);
    assert.equal(worker.notifications.length, 0, `setting ${setting}`);
    await worker.tickAt(boundary * minute);
    assert.equal(worker.notifications.length, 1, `setting ${setting}`);
    assert.match(worker.notifications[0].title, title);
  }
});

test('a warning sent yesterday does not suppress the new day warning', async () => {
  const worker = createBackgroundWorker({
    date: '2026-09-14', elapsed: 60 * minute, tracking: true,
    limitMs: 60 * minute, timerWarnMinutes: 10,
    baseWarningDate: '2026-09-14'
  });
  await worker.call('getState');
  await worker.tickAt(50 * minute);

  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].id, 'yt_warn_baseWarningDate_2026-09-15');
  assert.equal(worker.store.baseWarningDate, '2026-09-15');
});
