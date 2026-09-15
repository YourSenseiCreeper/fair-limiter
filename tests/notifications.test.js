const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const minute = 60_000;

function createWorker(store = {}) {
  const notifications = [];
  const event = { addListener() {} };
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const result = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) result[key] = store[key];
          return result;
        },
        async set(values) { Object.assign(store, values); }
      }
    },
    alarms: { get: async () => null, create() {}, clear() {}, onAlarm: event },
    notifications: {
      async create(id, details) { notifications.push({ id, ...details }); return id; },
      onClosed: event,
      onButtonClicked: event
    },
    runtime: {
      sendMessage: async () => {},
      onMessage: event,
      onStartup: event,
      onInstalled: event
    },
    tabs: { query: async () => [], onActivated: event, onUpdated: event },
    windows: { onFocusChanged: event }
  };
  const context = vm.createContext({ chrome });
  vm.runInContext(backgroundSource, context);
  store.date = vm.runInContext('todayKey()', context);

  return {
    store,
    notifications,
    async tickAt(elapsed) {
      store.elapsed = elapsed - 10_000;
      vm.runInContext('lastTickTime = null', context);
      await vm.runInContext('onTick()', context);
    }
  };
}

test('warns once before the daily limit and once before carried-over time ends', async () => {
  const worker = createWorker({
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
  const worker = createWorker({
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
  const disabled = createWorker({
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

  const noRollover = createWorker({ tracking: true, limitMs: 60 * minute });
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
  const first = createWorker(store);
  await first.tickAt(50 * minute);
  assert.equal(first.notifications.length, 1);

  const restarted = createWorker(store);
  await restarted.tickAt(51 * minute);
  assert.equal(restarted.notifications.length, 0);
  await restarted.tickAt(80 * minute);
  assert.equal(restarted.notifications.length, 1);
  assert.match(restarted.notifications[0].title, /carried-over time/);
});
