// content.js – injected into every youtube.com page
(async () => {
  // Ask background for current state
  let state;
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  } catch {
    return;
  }

  if (!state?.limitReached) {
    // Listen for future limit-reached broadcasts
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATE' && msg.limitReached) showBlockScreen();
    });
    return;
  }

  // Limit already reached when page loaded
  showBlockScreen();

  function showBlockScreen() {
    // Prevent YouTube JS from doing anything
    document.documentElement.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        min-height: 100vh;
        background: #0d0d0d;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'DM Sans', sans-serif;
        color: #f0ebe0;
        overflow: hidden;
      }

      .bg-grid {
        position: fixed; inset: 0; z-index: 0;
        background-image:
          linear-gradient(rgba(255,80,60,.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,80,60,.04) 1px, transparent 1px);
        background-size: 48px 48px;
        animation: gridDrift 30s linear infinite;
      }

      @keyframes gridDrift {
        from { background-position: 0 0; }
        to   { background-position: 48px 48px; }
      }

      .glow {
        position: fixed;
        width: 600px; height: 600px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,60,40,.18) 0%, transparent 70%);
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 0;
        animation: pulse 4s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { transform: translate(-50%,-50%) scale(1);   opacity: .8; }
        50%       { transform: translate(-50%,-50%) scale(1.1); opacity: 1; }
      }

      .card {
        position: relative; z-index: 1;
        text-align: center;
        max-width: 520px;
        padding: 64px 56px;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 24px;
        backdrop-filter: blur(20px);
        animation: fadeUp .6s cubic-bezier(.16,1,.3,1) both;
      }

      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(24px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .icon {
        font-size: 72px;
        line-height: 1;
        margin-bottom: 24px;
        display: block;
        animation: wobble 3s ease-in-out infinite;
      }

      @keyframes wobble {
        0%, 100% { transform: rotate(-4deg); }
        50%       { transform: rotate(4deg); }
      }

      h1 {
        font-family: 'DM Serif Display', serif;
        font-size: 2.4rem;
        line-height: 1.15;
        margin-bottom: 12px;
        background: linear-gradient(135deg, #ff6b4a, #ff3820);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      h1 em {
        font-style: italic;
      }

      .sub {
        font-size: .95rem;
        font-weight: 300;
        color: rgba(240,235,224,.55);
        line-height: 1.7;
        margin-bottom: 40px;
      }

      .time-badge {
        display: inline-block;
        background: rgba(255,80,40,.12);
        border: 1px solid rgba(255,80,40,.25);
        border-radius: 100px;
        padding: 6px 18px;
        font-size: .78rem;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #ff6b4a;
        margin-bottom: 36px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 32px;
        border-radius: 100px;
        font-family: 'DM Sans', sans-serif;
        font-size: .9rem;
        font-weight: 500;
        cursor: pointer;
        transition: all .2s;
        border: none;
        text-decoration: none;
      }

      .btn-extra {
        background: linear-gradient(135deg, #ff6b4a, #ff3820);
        color: #fff;
        box-shadow: 0 8px 32px rgba(255,56,32,.35);
      }

      .btn-extra:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px rgba(255,56,32,.5);
      }

      .btn-extra:disabled {
        opacity: .4; cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }

      .btn-home {
        background: rgba(255,255,255,.06);
        color: rgba(240,235,224,.6);
        border: 1px solid rgba(255,255,255,.1);
        margin-left: 8px;
      }

      .btn-home:hover {
        background: rgba(255,255,255,.1);
        color: #f0ebe0;
      }

      .divider {
        height: 1px;
        background: rgba(255,255,255,.07);
        margin: 36px 0;
      }

      .footer-note {
        font-size: .78rem;
        color: rgba(240,235,224,.3);
        letter-spacing: .03em;
      }

      .used-badge {
        font-size: .8rem;
        color: rgba(240,235,224,.35);
        margin-top: 12px;
        font-style: italic;
      }

      .success-msg {
        color: #4ade80;
        font-size: .9rem;
        margin-top: 12px;
        animation: fadeUp .4s ease both;
      }
    `;

    const html = `
      <div class="bg-grid"></div>
      <div class="glow"></div>
      <div class="card">
        <span class="icon">📵</span>
        <div class="time-badge">Daily limit reached</div>
        <h1>Time's up for<br><em>today</em>.</h1>
        <p class="sub">
          You've used your full YouTube allowance for today.<br>
          Come back tomorrow — or grant yourself a short grace period.
        </p>

        <div id="btn-area">
          <button class="btn btn-extra" id="btn-extra">
            ⏱ +5 more minutes
          </button>
          <a class="btn btn-home" href="https://google.com">Go somewhere else</a>
        </div>

        <div class="divider"></div>
        <p class="footer-note">YouTube Time Limiter · resets at midnight</p>
      </div>
    `;

    const body = document.createElement('body');
    body.innerHTML = html;
    document.head.appendChild(style);
    document.body ? document.body.replaceWith(body) : document.documentElement.appendChild(body);

    // Check if extra time already used
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => {
      if (s?.extraUsed) markExtraUsed();
    });

    document.getElementById('btn-extra')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-extra');
      btn.disabled = true;
      const res = await chrome.runtime.sendMessage({ type: 'GRANT_EXTRA' });
      if (res?.ok) {
        const area = document.getElementById('btn-area');
        area.insertAdjacentHTML('afterend', '<p class="success-msg">✓ 5 minutes granted — enjoy!</p>');
        // Page will reload via background.js
      } else {
        markExtraUsed();
      }
    });
  }

  function markExtraUsed() {
    const btn = document.getElementById('btn-extra');
    if (!btn) return;
    btn.disabled = true;
    btn.insertAdjacentHTML('afterend', '<p class="used-badge">Extra time already used today</p>');
  }
})();
