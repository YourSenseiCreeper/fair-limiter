# 📺 YouTube Time Limiter

A Chrome extension that enforces a daily time limit on YouTube, with a one-time grace period, native notifications, and a styled block screen.

---

## Features

- **Daily time limit** — configurable from 5 minutes to 4 hours in the timer settings (default: 1 hour)
- **Active-tab tracking only** — the timer runs only when a YouTube tab is focused; switching away pauses it
- **Configurable warnings** — choose 1 to 15 minutes before the daily limit ends; if carried-over time is available, receive another warning before it runs out
- **Limit notification** — when time runs out, a persistent notification appears; dismissing it closes all YouTube tabs
- **Block screen** — navigating to YouTube after the limit replaces the page content with a styled "time's up" screen
- **+5 min grace period** — a one-time daily extension, available from both the popup and the block screen
- **Unused-time rollover** — optionally carry unused daily time forward from selected weekdays, with a configurable per-day contribution and a 90-minute bank cap
- **Daily reset** — elapsed time and the extra-time token reset automatically at midnight

---

## Installation

No build step required — this is a plain Manifest V3 extension.

1. Download and unzip `yt-limiter.zip`
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `yt-limiter` folder
5. The 📺 icon will appear in your toolbar

---

## Tests

Run `node --test` from the repository root. The tests use Node's built-in test runner and controlled Chrome API and DOM substitutes, so Chrome is not required.

---

## Usage

### Popup

Click the toolbar icon to open the popup. It shows:

- A **ring timer** displaying time remaining and a visual fill that drains as you watch
- A **status pill** indicating whether YouTube is actively being tracked
- **Used today / Daily limit / Carried over** stats
- The **+5 min grace period** button (shown when allowed in timer settings, enabled after the limit is reached, one use per day)

Set the daily limit in the timer settings and click **Save timer settings** to apply it.
There you can also enable time remaining warnings and choose how many minutes before each allowance ends they appear.

### Saved-time bank

Enable **Carry unused time forward** in the timer settings, set the maximum added per day, and select which days of the week may contribute unused time to the bank. Monday through Friday are selected by default; Saturday and Sunday are not. You can select any combination, including no days, then click **Save timer settings**. The daily viewing limit still applies on every day, regardless of this selection.

At the next day change, unused daily time is added only if the previous day was selected. If the extension was closed for several days, only selected days in that gap contribute their capped daily allowance. Time already spent from the bank is deducted first, and the bank never exceeds 90 minutes. For example, if the bank is fully spent on Friday, it stays empty on Monday with the default weekday selection; the unused Saturday and Sunday limits do not refill it. Changing the selected days affects future bank calculations and does not remove time already saved.

### Block screen

When you visit YouTube after your limit is reached, the page is replaced with a full-screen block. From there you can use the grace period button if it hasn't been used yet, or navigate somewhere else.

### Grace period

Once per day, you can grant yourself an extra 5 minutes. This can be triggered from the popup or the block screen. When granted, any open YouTube tabs reload automatically and tracking resumes.

---

## File structure

```
yt-limiter/
├── manifest.json       # Extension manifest (Manifest V3)
├── background.js       # Wires services to Chrome events and messages
├── lib/
│   ├── time-domain.js  # Pure timer, rollover, and warning rules
│   ├── background-services.js # Storage, notifications, and timer coordination
│   ├── history-domain.js # Pure history date ranges
│   ├── history-view.js   # History chart controller
│   ├── timer-settings-controller.js # Timer settings
│   ├── shorts-settings-controller.js # Shorts settings
│   ├── popup-view.js   # Popup rendering
│   └── ui-format.js    # Shared time formatting
├── content.js          # YouTube limit block screen
├── shorts.js           # Shorts page controls
├── options.html        # Settings page markup
├── options.js          # Settings page wiring
├── popup.html          # Popup markup
├── popup.js            # Popup wiring
├── tests/              # Unit tests with controlled browser substitutes
└── icons/              # Extension icons
```

### How the timer works

The background service worker registers a Chrome alarm (`yt_tick`) that fires every 10 seconds. `background.js` connects the timer, state, history, and notification services to Chrome events. The pure rules in `lib/time-domain.js` calculate limits and rollover without using browser APIs. Services receive only the storage, tab, alarm, notification, and clock capabilities they need.

On each tick the timer checks whether a YouTube tab is active. If so, it saves the elapsed time in `chrome.storage.local`. When the total exceeds the configured limit, it triggers the notification and sets a `limitReached` flag that the content script checks on every page load.

State is keyed by date string (`YYYY-MM-DD`), so elapsed time and the extra-time token reset automatically when the date changes. When rollover is enabled, unused daily allowance from selected days of the week is added to the saved-time bank at that point. The daily allowance is consumed first; saved time is only consumed after it.

---

## Permissions used

| Permission | Why |
|---|---|
| `storage` | Persist elapsed time, limit, and daily state across browser sessions |
| `alarms` | Fire the 10-second tracking tick reliably from the service worker |
| `notifications` | Show the configurable time warnings and the limit-reached alert |
| `tabs` | Detect the active tab, close YouTube tabs when the notification is dismissed |
| `host_permissions: *://*.youtube.com/*` | Inject the content script and query YouTube tabs |

---

## Customisation

The following constants at the top of `background.js` can be edited directly:

```js
const DAILY_LIMIT_MS  = 60 * 60 * 1000;  // Default limit (1 hour)
const EXTRA_TIME_MS   = 5  * 60 * 1000;  // Grace period duration (5 minutes)
const TICK_INTERVAL_S = 10;              // How often elapsed time is saved
```

After editing, reload the extension from `chrome://extensions`.

---

## Limitations

- Tracking pauses when YouTube is in a background tab. Time in picture-in-picture mode is not counted.
- The extension does not work in Incognito mode unless explicitly enabled from `chrome://extensions`.
- The block screen is bypassed if the user disables the extension manually.
