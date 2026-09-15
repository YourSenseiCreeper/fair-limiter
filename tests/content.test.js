const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

async function createYoutubePage({ state = {}, rejectState = false } = {}) {
  const listeners = [];
  const styles = [];
  const document = {
    documentElement: { innerHTML: '<main>YouTube</main>' },
    head: { appendChild(style) { styles.push(style); } },
    body: { innerHTML: '<main>YouTube</main>', replaceWith(body) { document.body = body; } },
    createElement(tagName) { return { tagName, innerHTML: '', textContent: '' }; },
    getElementById() { return null; }
  };
  const chrome = {
    runtime: {
      sendMessage(_message, callback) {
        if (callback) return callback(state);
        return rejectState ? Promise.reject(new Error('Background unavailable')) : Promise.resolve(state);
      },
      onMessage: { addListener(listener) { listeners.push(listener); } }
    }
  };
  const context = vm.createContext({ document, chrome });
  await vm.runInContext(source, context);
  return { document, listeners, styles };
}

test('YouTube remains visible while the daily limit is not reached', async () => {
  const page = await createYoutubePage({ state: { limitReached: false } });
  assert.equal(page.document.body.innerHTML, '<main>YouTube</main>');
  assert.equal(page.styles.length, 0);
  assert.equal(page.listeners.length, 1);

  page.listeners[0]({ type: 'STATE_UPDATE', limitReached: false });
  assert.equal(page.document.body.innerHTML, '<main>YouTube</main>');
  page.listeners[0]({ type: 'STATE_UPDATE', limitReached: true });
  assert.match(page.document.body.innerHTML, /Daily limit reached/);
  assert.equal(page.styles.length, 1);
});

test('an already reached limit blocks YouTube as the page loads', async () => {
  const page = await createYoutubePage({ state: { limitReached: true } });
  assert.equal(page.document.documentElement.innerHTML, '');
  assert.match(page.document.body.innerHTML, /Time's up for/);
  assert.equal(page.listeners.length, 0);
});

test('content script exits safely when background state cannot be read', async () => {
  const page = await createYoutubePage({ rejectState: true });
  assert.equal(page.document.body.innerHTML, '<main>YouTube</main>');
  assert.equal(page.styles.length, 0);
  assert.equal(page.listeners.length, 0);
});
