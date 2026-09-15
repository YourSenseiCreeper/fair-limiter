class FakeElement {
  constructor(tagName = 'div', document = null) {
    this.tagName = tagName;
    this.document = document;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { setProperty(name, value) { this[name] = value; } };
    this._classes = new Set();
    this._textContent = '';
    this._innerHTML = '';
    this._id = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.title = '';
    this.classList = {
      add: name => this._classes.add(name),
      remove: name => this._classes.delete(name),
      contains: name => this._classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !this._classes.has(name);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get id() { return this._id; }
  set id(value) {
    if (this._id) this.document?.elements.delete(this._id);
    this._id = value;
    if (value) this.document?.elements.set(value, this);
  }

  get className() { return [...this._classes].join(' '); }
  set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }

  get textContent() { return this._textContent; }
  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children) { children.forEach(child => this.appendChild(child)); }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    if (this.id) this.document?.elements.delete(this.id);
    this.parent = null;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }

  addEventListener(name, listener) {
    const list = this.listeners.get(name) ?? [];
    list.push(listener);
    this.listeners.set(name, list);
  }

  async emit(name, ...args) {
    for (const listener of this.listeners.get(name) ?? []) await listener(...args);
  }
}

class FakeDocument {
  constructor({ autocreate = false } = {}) {
    this.autocreate = autocreate;
    this.elements = new Map();
    this.selectors = new Map();
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.append(this.head, this.body);
  }

  createElement(tagName) { return new FakeElement(tagName, this); }

  ensure(id) {
    const element = this.createElement('div');
    element.id = id;
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) ?? (this.autocreate ? this.ensure(id) : null);
  }

  querySelectorAll(selector) { return this.selectors.get(selector) ?? []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  setSelector(selector, elements) { this.selectors.set(selector, elements); }
}

module.exports = { FakeDocument, FakeElement };
