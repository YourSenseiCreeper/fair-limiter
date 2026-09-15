const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeDocument } = require('./helpers/fake-dom');

const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const formatSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ui-format.js'), 'utf8');
const viewSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'popup-view.js'), 'utf8');
const minute = 60_000;

function createPopup({ timerGrace, state = {}, deferStorageRead = false } = {}) {
  const document = new FakeDocument({ autocreate: true });
  document.ensure('grace-actions').hidden = true;
  const sent = [];
  const createdTabs = [];
  const storageListeners = [];
  const runtimeListeners = [];
  let storageCallback;
  let optionsOpened = 0;
  let currentState = { elapsed: 0, limitMs: 60 * minute, ...state };
  const chrome = {
    storage: {
      local: {
        get(_key, callback) {
          if (deferStorageRead) storageCallback = callback;
          else callback(timerGrace === undefined ? {} : { timerGrace });
        }
      },
      onChanged: { addListener(listener) { storageListeners.push(listener); } }
    },
    runtime: {
      sendMessage(message, callback) {
        sent.push(message);
        if (message.type === 'GET_STATE') callback(currentState);
        else callback?.({ ok: true });
      },
      onMessage: { addListener(listener) { runtimeListeners.push(listener); } },
      openOptionsPage() { optionsOpened++; },
      getURL(file) { return `chrome-extension://test/${file}`; }
    },
    tabs: { create(details) { createdTabs.push(details); } }
  };
  const context = vm.createContext({ document, chrome });
  vm.runInContext(formatSource, context);
  vm.runInContext(viewSource, context);
  vm.runInContext(source, context);
  return {
    context,
    document,
    sent,
    createdTabs,
    storageListeners,
    runtimeListeners,
    get optionsOpened() { return optionsOpened; },
    setState(value) { currentState = value; },
    finishStorageRead(value) { storageCallback(value); }
  };
}

test('popup shows the grace control by default and hides it when disabled', () => {
  const enabled = createPopup();
  assert.equal(enabled.document.getElementById('grace-actions').hidden, false);
  assert.equal(enabled.document.getElementById('btn-extra').disabled, true);

  const disabled = createPopup({ timerGrace: false });
  assert.equal(disabled.document.getElementById('grace-actions').hidden, true);
  disabled.storageListeners[0]({ timerGrace: { newValue: true } }, 'local');
  assert.equal(disabled.document.getElementById('grace-actions').hidden, false);
  disabled.storageListeners[0]({ timerGrace: { newValue: false } }, 'sync');
  assert.equal(disabled.document.getElementById('grace-actions').hidden, false);
});

test('a late storage read cannot undo a newer grace setting', () => {
  const popup = createPopup({ deferStorageRead: true });
  popup.storageListeners[0]({ timerGrace: { newValue: false } }, 'local');
  popup.finishStorageRead({ timerGrace: true });
  assert.equal(popup.document.getElementById('grace-actions').hidden, true);
});

test('popup uses the effective limit for remaining time and keeps daily stats separate', () => {
  const popup = createPopup({
    state: {
      elapsed: 70 * minute,
      limitMs: 60 * minute,
      effectiveLimitMs: 90 * minute,
      rolloverRemainingMs: 20 * minute,
      tracking: true
    }
  });
  const get = id => popup.document.getElementById(id);
  assert.equal(get('time-left').textContent, '20:00');
  assert.equal(get('used-time').textContent, '1h 10m');
  assert.equal(get('limit-display').textContent, '1h');
  assert.equal(get('rollover-display').textContent, '20m');
  assert.equal(get('status-text').textContent, 'Watching now');
  assert.equal(get('btn-extra').disabled, true);

  popup.setState({
    elapsed: 90 * minute, limitMs: 60 * minute,
    effectiveLimitMs: 90 * minute, limitReached: true,
    rolloverRemainingMs: 0, extraUsed: false
  });
  popup.runtimeListeners[0]({ type: 'STATE_UPDATE' });
  assert.equal(get('ring-label').textContent, 'limit reached');
  assert.equal(get('status-text').textContent, 'Limit reached');
  assert.equal(get('btn-extra').disabled, false);

  popup.setState({
    elapsed: 90 * minute, limitMs: 60 * minute,
    effectiveLimitMs: 95 * minute, extraUsed: true
  });
  popup.runtimeListeners[0]({ type: 'STATE_UPDATE' });
  assert.equal(get('btn-extra').disabled, true);
  assert.equal(get('btn-extra').textContent, '✓ Extra time used');
});

test('popup actions send the expected extension messages', async () => {
  const popup = createPopup({
    state: { elapsed: 60 * minute, limitReached: true }
  });
  await popup.document.getElementById('btn-extra').emit('click');
  assert.equal(popup.sent.filter(message => message.type === 'GRANT_EXTRA').length, 1);
  assert.equal(popup.sent.filter(message => message.type === 'GET_STATE').length, 2);

  await popup.document.getElementById('btn-settings').emit('click');
  await popup.document.getElementById('btn-history').emit('click');
  assert.equal(popup.optionsOpened, 1);
  assert.equal(popup.createdTabs[0].url, 'chrome-extension://test/options.html#history');
});
