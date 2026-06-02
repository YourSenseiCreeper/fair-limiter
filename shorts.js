// shorts.js – Shorts blocking content script
// Runs independently from content.js so it works even when time limit isn't reached.

(async () => {
  // ── load settings ──────────────────────────────────────────────────────────
  async function getShortsSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(['shortsHideSections', 'shortsBlockPlayback'], data => {
        resolve({
          hideSections:   data.shortsHideSections   ?? false,
          blockPlayback:  data.shortsBlockPlayback   ?? false,
        });
      });
    });
  }

  let settings = await getShortsSettings();

  // Re-apply whenever settings change
  chrome.storage.onChanged.addListener((changes) => {
    if ('shortsHideSections' in changes || 'shortsBlockPlayback' in changes) {
      getShortsSettings().then(s => {
        settings = s;
        applyHiding();
        if (s.blockPlayback && isShortsUrl()) redirectFromShorts();
      });
    }
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  function isShortsUrl() {
    return location.pathname.startsWith('/shorts');
  }

  // ── redirect Shorts playback ───────────────────────────────────────────────
  function redirectFromShorts() {
    if (!isShortsUrl()) return;

    // Extract video ID from /shorts/<id>
    const videoId = location.pathname.split('/shorts/')[1]?.split('?')[0];
    if (videoId) {
      // Redirect to regular watch page – user can still watch, just not as Shorts
      // Actually we want to BLOCK entirely, so show a block overlay
    }
    showShortsBlockOverlay();
  }

  function showShortsBlockOverlay() {
    // Don't double-insert
    if (document.getElementById('ytl-shorts-block')) return;

    const style = document.createElement('style');
    style.id = 'ytl-shorts-block-style';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

      #ytl-shorts-block {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        background: #0d0d0d;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'DM Sans', sans-serif;
        color: #f0ebe0;
      }

      #ytl-shorts-block .sb-grid {
        position: absolute; inset: 0;
        background-image:
          linear-gradient(rgba(139,92,246,.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139,92,246,.05) 1px, transparent 1px);
        background-size: 40px 40px;
      }

      #ytl-shorts-block .sb-glow {
        position: absolute;
        width: 500px; height: 500px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(139,92,246,.2) 0%, transparent 70%);
        top: 50%; left: 50%;
        transform: translate(-50%,-50%);
        animation: sbPulse 4s ease-in-out infinite;
      }

      @keyframes sbPulse {
        0%,100% { transform: translate(-50%,-50%) scale(1);   opacity:.7; }
        50%      { transform: translate(-50%,-50%) scale(1.1); opacity:1;  }
      }

      #ytl-shorts-block .sb-card {
        position: relative;
        text-align: center;
        max-width: 460px;
        padding: 56px 48px;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 24px;
        backdrop-filter: blur(20px);
        animation: sbFade .5s cubic-bezier(.16,1,.3,1) both;
      }

      @keyframes sbFade {
        from { opacity:0; transform:translateY(20px); }
        to   { opacity:1; transform:translateY(0); }
      }

      #ytl-shorts-block .sb-icon {
        font-size: 64px;
        display: block;
        margin-bottom: 20px;
        animation: sbWobble 3s ease-in-out infinite;
      }

      @keyframes sbWobble {
        0%,100% { transform: rotate(-5deg) scale(1); }
        50%      { transform: rotate(5deg) scale(1.05); }
      }

      #ytl-shorts-block .sb-badge {
        display: inline-block;
        background: rgba(139,92,246,.15);
        border: 1px solid rgba(139,92,246,.3);
        border-radius: 100px;
        padding: 5px 16px;
        font-size: .72rem;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #a78bfa;
        margin-bottom: 20px;
      }

      #ytl-shorts-block h1 {
        font-family: 'DM Serif Display', serif;
        font-size: 2rem;
        line-height: 1.2;
        margin-bottom: 12px;
        background: linear-gradient(135deg, #a78bfa, #7c3aed);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      #ytl-shorts-block h1 em { font-style: italic; }

      #ytl-shorts-block p {
        font-size: .9rem;
        font-weight: 300;
        color: rgba(240,235,224,.5);
        line-height: 1.7;
        margin-bottom: 32px;
      }

      #ytl-shorts-block .sb-btn-row {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }

      #ytl-shorts-block .sb-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        border-radius: 100px;
        font-family: 'DM Sans', sans-serif;
        font-size: .85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all .18s;
        border: none;
        text-decoration: none;
        color: inherit;
      }

      #ytl-shorts-block .sb-btn-watch {
        background: linear-gradient(135deg, #7c3aed, #a78bfa);
        color: #fff;
        box-shadow: 0 6px 24px rgba(124,58,237,.35);
      }

      #ytl-shorts-block .sb-btn-watch:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 32px rgba(124,58,237,.5);
      }

      #ytl-shorts-block .sb-btn-back {
        background: rgba(255,255,255,.05);
        color: rgba(240,235,224,.6);
        border: 1px solid rgba(255,255,255,.1);
      }

      #ytl-shorts-block .sb-btn-back:hover {
        background: rgba(255,255,255,.1);
        color: #f0ebe0;
      }

      #ytl-shorts-block .sb-footer {
        margin-top: 28px;
        font-size: .72rem;
        color: rgba(240,235,224,.25);
        letter-spacing: .04em;
      }
    `;

    const videoId = location.pathname.split('/shorts/')[1]?.split('?')[0] ?? '';

    const overlay = document.createElement('div');
    overlay.id = 'ytl-shorts-block';
    overlay.innerHTML = `
      <div class="sb-grid"></div>
      <div class="sb-glow"></div>
      <div class="sb-card">
        <span class="sb-icon">🚫</span>
        <div class="sb-badge">Shorts blocked</div>
        <h1>Not this<br><em>format.</em></h1>
        <p>
          YouTube Shorts are blocked by your extension settings.<br>
          You can still watch this as a regular video, or head back.
        </p>
        <div class="sb-btn-row">
          ${videoId
            ? `<a class="sb-btn sb-btn-watch" href="https://www.youtube.com/watch?v=${videoId}">▶ Watch as normal video</a>`
            : ''
          }
          <a class="sb-btn sb-btn-back" href="https://www.youtube.com/">← Back to YouTube</a>
        </div>
        <p class="sb-footer">Change this in extension Settings → Shorts</p>
      </div>
    `;

    document.head?.appendChild(style) ?? document.documentElement.appendChild(style);
    document.body
      ? document.body.appendChild(overlay)
      : document.documentElement.appendChild(overlay);
  }

  function removeShortsBlockOverlay() {
    document.getElementById('ytl-shorts-block')?.remove();
    document.getElementById('ytl-shorts-block-style')?.remove();
  }

  // ── CSS injection for hiding Shorts sections ───────────────────────────────
  const HIDE_STYLE_ID = 'ytl-hide-shorts-style';

  // These selectors cover the Shorts shelf on Home, sidebar entries,
  // search results, subscriptions feed, and the chip filter
  const SHORTS_HIDE_CSS = `
    /* Home page Shorts shelf */
    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
    ytd-rich-section-renderer:has([overlay-style="SHORTS"]),

    /* Shorts entries in search results */
    ytd-video-renderer:has([overlay-style="SHORTS"]),
    ytd-compact-video-renderer:has([overlay-style="SHORTS"]),

    /* Left sidebar Shorts nav item */
    ytd-guide-entry-renderer:has(a[title="Shorts"]),
    ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),

    /* Top chip / filter bar Shorts chip */
    yt-chip-cloud-chip-renderer:has([title="Shorts"]),

    /* Subscriptions / feed Shorts shelf */
    ytd-shelf-renderer:has([overlay-style="SHORTS"]),

    /* Reels shelf (alternate internal name) */
    ytd-reel-shelf-renderer,

    /* Shorts in sidebar recommendations */
    ytd-compact-video-renderer:has(a[href*="/shorts/"]) {
      display: none !important;
    }
  `;

  function applyHiding() {
    const existing = document.getElementById(HIDE_STYLE_ID);
    if (settings.hideSections) {
      if (!existing) {
        const s = document.createElement('style');
        s.id = HIDE_STYLE_ID;
        s.textContent = SHORTS_HIDE_CSS;
        (document.head ?? document.documentElement).appendChild(s);
      }
    } else {
      existing?.remove();
    }
  }

  // ── handle Shorts playback block ───────────────────────────────────────────
  function handlePlaybackBlock() {
    if (settings.blockPlayback && isShortsUrl()) {
      showShortsBlockOverlay();
    } else {
      removeShortsBlockOverlay();
    }
  }

  // ── SPA navigation: YouTube uses pushState ─────────────────────────────────
  // We need to react to YouTube's internal navigation events
  let lastPath = location.pathname;

  function onNavigation() {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    handlePlaybackBlock();
  }

  // YouTube fires yt-navigate-finish for SPA transitions
  window.addEventListener('yt-navigate-finish', onNavigation);
  // Fallback: intercept history API
  const _pushState = history.pushState.bind(history);
  history.pushState = (...args) => { _pushState(...args); onNavigation(); };
  const _replaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => { _replaceState(...args); onNavigation(); };
  window.addEventListener('popstate', onNavigation);

  // ── initial run ────────────────────────────────────────────────────────────
  applyHiding();
  handlePlaybackBlock();

  // Also re-apply hiding after DOM mutations (YouTube lazy-renders shelves)
  if (settings.hideSections) {
    const obs = new MutationObserver(() => applyHiding());
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Disconnect the heavy observer after 30s (page fully loaded by then)
    setTimeout(() => obs.disconnect(), 30_000);
  }
})();
