const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    async emit(...args) {
      for (const listener of listeners) await listener(...args);
    }
  };
}

function createBackgroundWorker(store = {}, options = {}) {
  let now = options.now ?? new Date(2026, 8, 15, 12).getTime();
  let activeTabs = options.activeTabs ?? [];
  let youtubeTabs = options.youtubeTabs ?? [];
  const notifications = [];
  const runtimeMessages = [];
  const reloadedTabs = [];
  const removedTabs = [];
  const alarms = new Map();
  const events = {
    alarm: createEvent(),
    notificationClosed: createEvent(),
    notificationButtonClicked: createEvent(),
    message: createEvent(),
    startup: createEvent(),
    installed: createEvent(),
    tabActivated: createEvent(),
    tabUpdated: createEvent(),
    windowFocusChanged: createEvent()
  };

  class WorkerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }

  const chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (key in store) result[key] = store[key];
          }
          if (callback) return callback(result);
          return Promise.resolve(result);
        },
        set(values, callback) {
          Object.assign(store, values);
          if (callback) return callback();
          return Promise.resolve();
        }
      }
    },
    alarms: {
      get: async name => alarms.get(name) ?? null,
      create(name, details) { alarms.set(name, details); },
      clear(name) { return alarms.delete(name); },
      onAlarm: events.alarm
    },
    notifications: {
      async create(id, details) { notifications.push({ id, ...details }); return id; },
      onClosed: events.notificationClosed,
      onButtonClicked: events.notificationButtonClicked
    },
    runtime: {
      sendMessage(message) { runtimeMessages.push(message); return Promise.resolve(); },
      onMessage: events.message,
      onStartup: events.startup,
      onInstalled: events.installed
    },
    tabs: {
      query: async query => query.url ? youtubeTabs : activeTabs,
      reload(id) { reloadedTabs.push(id); },
      remove(id) { removedTabs.push(id); },
      onActivated: events.tabActivated,
      onUpdated: events.tabUpdated
    },
    windows: { onFocusChanged: events.windowFocusChanged }
  };

  const context = vm.createContext({ chrome, Date: WorkerDate });
  vm.runInContext(source, context);
  if (!('date' in store)) store.date = vm.runInContext('todayKey()', context);

  return {
    store,
    notifications,
    runtimeMessages,
    reloadedTabs,
    removedTabs,
    alarms,
    events,
    call(name, ...args) { return vm.runInContext(name, context)(...args); },
    setNow(value) { now = value instanceof Date ? value.getTime() : value; },
    setLastTickAge(milliseconds) {
      context.tickAge = milliseconds;
      vm.runInContext('lastTickTime = Date.now() - tickAge', context);
    },
    setActiveTabs(tabs) { activeTabs = tabs; },
    setYoutubeTabs(tabs) { youtubeTabs = tabs; },
    async tickAt(elapsed) {
      store.elapsed = elapsed - 10_000;
      vm.runInContext('lastTickTime = null', context);
      await vm.runInContext('onTick()', context);
    },
    request(message) {
      return new Promise(resolve => {
        events.message.listeners[0](message, {}, resolve);
      });
    }
  };
}

module.exports = { createBackgroundWorker };
