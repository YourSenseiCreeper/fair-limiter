const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeDocument } = require('./helpers/fake-dom');

const source = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
const sharedSources = [
  'ui-format.js', 'time-domain.js', 'history-domain.js', 'history-view.js',
  'timer-settings-controller.js', 'shorts-settings-controller.js'
]
  .map(file => fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8'));
const minute = 60_000;

function createOptionsPage({ now = new Date(2026, 8, 15, 12), store = {}, state = {}, shorts = {}, watchHistory = {} } = {}) {
  const document = new FakeDocument({ autocreate: true });
  const sent = [];
  const rangeButtons = ['week', 'month', 'year'].map(range => {
    const button = document.createElement('button');
    button.dataset.range = range;
    return button;
  });
  document.setSelector('.range-btn', rangeButtons);
  document.ensure('save-bar-shorts').classList.add('hidden');
  for (const day of [1, 2, 3, 4, 5, 6, 0]) document.ensure(`rollover-day-${day}`);

  class PageDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }

  const chrome = {
    runtime: {
      sendMessage(message, callback) {
        sent.push(message);
        if (message.type === 'GET_STATE') callback({ limitMs: 60 * minute, ...state });
        else if (message.type === 'GET_SHORTS') callback({ hideSections: false, blockPlayback: false, ...shorts });
        else if (message.type === 'GET_HISTORY') callback({ history: watchHistory });
        else callback?.({ ok: true });
      }
    },
    storage: {
      local: {
        get(keys, callback) {
          const data = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (key in store) data[key] = store[key];
          }
          callback(data);
        },
        set(values, callback) { Object.assign(store, values); callback?.(); }
      }
    }
  };

  const context = vm.createContext({ document, chrome, Date: PageDate, location: { hash: '' }, history: { replaceState() {} }, setTimeout() {} });
  sharedSources.forEach(sharedSource => vm.runInContext(sharedSource, context));
  vm.runInContext(source, context);
  return { context, document, sent, store, rangeButtons };
}

test('long history range covers exactly the current month and seven prior months', () => {
  const page = createOptionsPage();
  const days = vm.runInContext('YtLimiterHistory.days("year", new Date())', page.context);
  const monthKeys = new Set(days.map(day => `${day.getFullYear()}-${day.getMonth()}`));
  assert.equal(monthKeys.size, 8);
  assert.equal(days[0].getFullYear(), 2026);
  assert.equal(days[0].getMonth(), 1);
  assert.equal(days[0].getDate(), 1);
  assert.equal(days.at(-1).getMonth(), 8);
  assert.equal(days.at(-1).getDate(), 15);
  assert.equal(vm.runInContext('YtLimiterHistory.days("week", new Date())', page.context).length, 7);
  assert.equal(vm.runInContext('YtLimiterHistory.days("month", new Date())', page.context).length, 30);
});

test('long history range remains eight calendar months across New Year', () => {
  const page = createOptionsPage({ now: new Date(2027, 0, 31, 12) });
  const days = vm.runInContext('YtLimiterHistory.days("year", new Date())', page.context);
  const monthKeys = new Set(days.map(day => `${day.getFullYear()}-${day.getMonth()}`));
  assert.equal(monthKeys.size, 8);
  assert.equal(days[0].getFullYear(), 2026);
  assert.equal(days[0].getMonth(), 5);
  assert.equal(days[0].getDate(), 1);
  assert.equal(days.at(-1).getFullYear(), 2027);
  assert.equal(days.at(-1).getMonth(), 0);
  assert.equal(days.at(-1).getDate(), 31);
});

test('history summary and heatmap use only days in the selected range', async () => {
  const page = createOptionsPage({
    watchHistory: {
      '2026-01-31': 90 * minute,
      '2026-02-01': 30 * minute,
      '2026-09-15': 60 * minute
    }
  });
  await page.rangeButtons[2].emit('click');

  assert.equal(page.document.getElementById('history-period').textContent, 'Last 8 months');
  assert.equal(page.document.getElementById('history-total').textContent, '1h 30m');
  assert.equal(page.document.getElementById('history-longest').textContent, '1h');
  assert.equal(page.document.getElementById('history-active').textContent, '2');

  const chart = page.document.getElementById('history-chart');
  const content = chart.children[0].children[0];
  const months = content.children[0];
  const grid = content.children[1].children[1];
  assert.equal(months.children.length, 8);
  assert.equal(grid.children.length, 227);
});

test('empty history renders zero totals and unmarked heatmap cells', async () => {
  const page = createOptionsPage();
  await page.rangeButtons[2].emit('click');

  const get = id => page.document.getElementById(id);
  assert.equal(get('history-total').textContent, '0m');
  assert.equal(get('history-average').textContent, '0m');
  assert.equal(get('history-longest').textContent, '0m');
  assert.equal(get('history-active').textContent, '0');
  const grid = get('history-chart').children[0].children[0].children[1].children[1];
  assert.ok(grid.children.length > 0);
  assert.ok(grid.children.every(cell => cell.dataset.level === '0'));
});

test('history ranges include leap day without changing their day counts', () => {
  const page = createOptionsPage({ now: new Date(2024, 2, 1, 12) });
  const monthDays = vm.runInContext('YtLimiterHistory.days("month", new Date())', page.context);
  assert.equal(monthDays.length, 30);
  assert.equal(monthDays[0].getMonth(), 1);
  assert.equal(monthDays[0].getDate(), 1);
  assert.ok(monthDays.some(day => day.getMonth() === 1 && day.getDate() === 29));

  const yearDays = vm.runInContext('YtLimiterHistory.days("year", new Date())', page.context);
  assert.ok(yearDays.some(day => day.getMonth() === 1 && day.getDate() === 29));
  assert.equal(yearDays.at(-1).getDate(), 1);
});

test('timer settings save limit, rollover, warning lead time, and toggles together', async () => {
  const page = createOptionsPage({
    store: { timerWarn: false, timerWarnMinutes: 12, timerGrace: false },
    state: { rolloverEnabled: true, rolloverDailyCapMs: 20 * minute, rolloverDays: [1, 3, 5] }
  });
  const get = id => page.document.getElementById(id);
  assert.equal(get('warning-minutes-slider').value, 12);
  assert.equal(get('warning-minutes-slider').disabled, true);
  assert.equal(get('rollover-cap-slider').disabled, false);
  assert.equal(get('rollover-day-1').checked, true);
  assert.equal(get('rollover-day-2').checked, false);
  assert.equal(get('rollover-day-6').checked, false);

  get('toggle-warn').checked = true;
  await get('toggle-warn').emit('change');
  assert.equal(get('warning-minutes-slider').disabled, false);
  get('warning-minutes-slider').value = '15';
  await get('warning-minutes-slider').emit('input');
  assert.equal(get('warning-minutes-badge').textContent, '15m');
  get('timer-slider').value = '90';
  get('rollover-cap-slider').value = '25';
  get('rollover-day-6').checked = true;
  get('toggle-close-tab').checked = false;
  await get('save-timer').emit('click');

  const limitMessage = page.sent.find(message => message.type === 'SET_LIMIT');
  const rolloverMessage = page.sent.find(message => message.type === 'SET_ROLLOVER');
  assert.equal(limitMessage.limitMs, 90 * minute);
  assert.equal(rolloverMessage.enabled, true);
  assert.equal(rolloverMessage.dailyCapMs, 25 * minute);
  assert.deepEqual(Array.from(rolloverMessage.days), [1, 3, 5, 6]);
  assert.equal(page.store.timerWarn, true);
  assert.equal(page.store.timerWarnMinutes, 15);
  assert.equal(page.store.timerCloseTab, false);
  assert.equal(page.store.timerGrace, false);
});

test('rollover day choices default to weekdays and follow the rollover toggle', async () => {
  const page = createOptionsPage();
  const get = id => page.document.getElementById(id);
  for (const day of [1, 2, 3, 4, 5]) {
    assert.equal(get(`rollover-day-${day}`).checked, true);
    assert.equal(get(`rollover-day-${day}`).disabled, true);
  }
  for (const day of [0, 6]) assert.equal(get(`rollover-day-${day}`).checked, false);

  get('toggle-rollover').checked = true;
  await get('toggle-rollover').emit('change');
  assert.equal(get('rollover-day-6').disabled, false);
  for (const day of [1, 2, 3, 4, 5]) get(`rollover-day-${day}`).checked = false;
  await get('save-timer').emit('click');
  assert.deepEqual(Array.from(page.sent.find(message => message.type === 'SET_ROLLOVER').days), []);
});

test('settings page clamps stored warning minutes before displaying or saving them', async () => {
  for (const { stored, expected } of [
    { stored: 0, expected: '1' },
    { stored: 99, expected: '15' },
    { stored: 'invalid', expected: '1' }
  ]) {
    const page = createOptionsPage({ store: { timerWarnMinutes: stored } });
    const slider = page.document.getElementById('warning-minutes-slider');
    assert.equal(String(slider.value), expected);
    assert.equal(page.document.getElementById('warning-minutes-badge').textContent, `${expected}m`);
    await page.document.getElementById('save-timer').emit('click');
    assert.equal(page.store.timerWarnMinutes, Number(expected));
  }
});

test('Shorts settings can be discarded or saved after a change', async () => {
  const page = createOptionsPage({ shorts: { hideSections: false, blockPlayback: true } });
  const get = id => page.document.getElementById(id);
  get('toggle-hide-sections').checked = true;
  await get('toggle-hide-sections').emit('change');
  assert.equal(get('save-bar-shorts').classList.contains('hidden'), false);

  await get('discard-shorts').emit('click');
  assert.equal(get('toggle-hide-sections').checked, false);
  assert.equal(get('toggle-block-playback').checked, true);
  assert.equal(get('save-bar-shorts').classList.contains('hidden'), true);

  get('toggle-block-playback').checked = false;
  await get('toggle-block-playback').emit('change');
  await get('save-shorts').emit('click');
  const message = page.sent.find(item => item.type === 'SET_SHORTS');
  assert.equal(message.hideSections, false);
  assert.equal(message.blockPlayback, false);
  assert.equal(get('save-bar-shorts').classList.contains('hidden'), true);
});
