const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeDocument } = require('./helpers/fake-dom');

const source = fs.readFileSync(path.join(__dirname, '..', 'shorts.js'), 'utf8');

async function createShortsPage({ pathname = '/', store = {} } = {}) {
  const document = new FakeDocument();
  const location = { pathname };
  const listeners = new Map();
  const storageListeners = [];
  const observers = [];
  const window = {
    addEventListener(name, listener) { listeners.set(name, listener); }
  };
  const history = { pushState() {}, replaceState() {} };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const data = {};
          for (const key of keys) if (key in store) data[key] = store[key];
          callback(data);
        }
      },
      onChanged: { addListener(listener) { storageListeners.push(listener); } }
    }
  };
  const context = vm.createContext({ document, location, window, history, chrome, MutationObserver, setTimeout() {} });
  await vm.runInContext(source, context);
  return {
    document,
    location,
    history,
    store,
    listeners,
    observers,
    async changeSettings(values) {
      Object.assign(store, values);
      const changes = Object.fromEntries(Object.keys(values).map(key => [key, { newValue: values[key] }]));
      storageListeners[0](changes, 'local');
      await new Promise(resolve => setImmediate(resolve));
    },
    navigate(pathname, method = 'pushState') {
      location.pathname = pathname;
      history[method]({}, '', pathname);
    }
  };
}

test('Shorts controls are inactive when both options are disabled', async () => {
  const page = await createShortsPage({ pathname: '/shorts/video123' });
  assert.equal(page.document.getElementById('ytl-hide-shorts-style'), null);
  assert.equal(page.document.getElementById('ytl-shorts-block'), null);
});

test('hiding Shorts sections injects one style and removes it when disabled', async () => {
  const page = await createShortsPage({ store: { shortsHideSections: true } });
  assert.ok(page.document.getElementById('ytl-hide-shorts-style'));
  assert.equal(page.observers.length, 1);
  page.observers[0].callback();
  assert.equal(page.document.head.children.filter(child => child.id === 'ytl-hide-shorts-style').length, 1);

  await page.changeSettings({ shortsHideSections: false });
  assert.equal(page.document.getElementById('ytl-hide-shorts-style'), null);
});

test('blocking Shorts follows single-page navigation without duplicate overlays', async () => {
  const page = await createShortsPage({
    pathname: '/shorts/video123', store: { shortsBlockPlayback: true }
  });
  const first = page.document.getElementById('ytl-shorts-block');
  assert.ok(first);
  assert.match(first.innerHTML, /watch\?v=video123/);

  page.listeners.get('yt-navigate-finish')();
  assert.equal(page.document.body.children.filter(child => child.id === 'ytl-shorts-block').length, 1);
  page.navigate('/watch?v=video123');
  assert.equal(page.document.getElementById('ytl-shorts-block'), null);
  assert.equal(page.document.getElementById('ytl-shorts-block-style'), null);

  page.navigate('/shorts/second', 'replaceState');
  assert.ok(page.document.getElementById('ytl-shorts-block'));
});

test('changing playback setting on a Shorts page updates the overlay immediately', async () => {
  const page = await createShortsPage({ pathname: '/shorts/video123' });
  await page.changeSettings({ shortsBlockPlayback: true });
  assert.ok(page.document.getElementById('ytl-shorts-block'));

  await page.changeSettings({ shortsBlockPlayback: false });
  assert.equal(page.document.getElementById('ytl-shorts-block'), null);
});
