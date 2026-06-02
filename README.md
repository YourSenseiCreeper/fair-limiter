# 📺 YouTube Time Limiter

A Chrome extension that enforces a daily time limit on YouTube, with a one-time grace period, native notifications, and a styled block screen.

---

## Features

- **Daily time limit** — configurable from 5 minutes to 4 hours via the popup slider (default: 1 hour)
- **Active-tab tracking only** — the timer runs only when a YouTube tab is focused; switching away pauses it
- **1-minute warning** — a system notification fires when you have under a minute left
- **Limit notification** — when time runs out, a persistent notification appears; dismissing it closes all YouTube tabs
- **Block screen** — navigating to YouTube after the limit replaces the page content with a styled "time's up" screen
- **+5 min grace period** — a one-time daily extension, available from both the popup and the block screen
- **Daily reset** — elapsed time and the extra-time token reset automatically at midnight
- **Manual reset** — a reset button in the popup lets you clear today's timer early

---

## Installation

No build step required — this is a plain Manifest V3 extension.

1. Download and unzip `yt-limiter.zip`
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `yt-limiter` folder
5. The 📺 icon will appear in your toolbar

---

## Usage

### Popup

Click the toolbar icon to open the popup. It shows:

- A **ring timer** displaying time remaining and a visual fill that drains as you watch
- A **status pill** indicating whether YouTube is actively being tracked
- **Used today / Daily limit** stats
- A **slider** to adjust the daily limit (changes take effect immediately)
- The **+5 min grace period** button (enabled only after the limit is reached, one use per day)
- A **Reset today's timer** button

### Block screen

When you visit YouTube after your limit is reached, the page is replaced with a full-screen block. From there you can use the grace period button if it hasn't been used yet, or navigate somewhere else.

### Grace period

Once per day, you can grant yourself an extra 5 minutes. This can be triggered from the popup or the block screen. When granted, any open YouTube tabs reload automatically and tracking resumes.

---

## File structure

```
yt-limiter/
├── manifest.json    # Extension manifest (Manifest V3)
├── background.js    # Service worker: timer logic, alarms, notifications, state
├── content.js       # Injected into youtube.com: renders the block screen
├── popup.html       # Popup markup
├── popup.js         # Popup UI logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### How the timer works

The background service worker registers a Chrome alarm (`yt_tick`) that fires every 10 seconds. On each tick it checks whether a YouTube tab is active and focused. If so, it adds the elapsed delta to a running total stored in `chrome.storage.local`. When the total exceeds the configured limit, it triggers the notification and sets a `limitReached` flag that the content script checks on every page load.

State is keyed by date string (`YYYY-MM-DD`), so elapsed time and the extra-time token reset automatically when the date changes.

---

## Permissions used

| Permission | Why |
|---|---|
| `storage` | Persist elapsed time, limit, and daily state across browser sessions |
| `alarms` | Fire the 10-second tracking tick reliably from the service worker |
| `notifications` | Show the 1-minute warning and the limit-reached alert |
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