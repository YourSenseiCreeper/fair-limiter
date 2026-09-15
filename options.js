// Composition root for the settings page.
function showToast(message = '✓ Settings saved', color = 'var(--green)') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.color = color;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

const historyController = YtLimiterHistoryView.createHistoryController(
  document, chrome.runtime, YtLimiterFormat, YtLimiterHistory, () => new Date()
);
YtLimiterTimerSettings.createTimerSettingsController(
  document, chrome.runtime, chrome.storage.local, YtLimiterFormat, showToast
);
YtLimiterShortsSettings.createShortsSettingsController(document, chrome.runtime, showToast);

function selectTab(tab) {
  const button = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const panel = document.getElementById(`panel-${tab}`);
  if (!button || !panel) return;
  document.querySelectorAll('.tab-btn').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  panel.classList.add('active');
  if (tab === 'history') historyController.load();
}

document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    selectTab(button.dataset.tab);
    history.replaceState(null, '', `#${button.dataset.tab}`);
  });
});

const initialTab = location.hash.slice(1);
if (initialTab) selectTab(initialTab);
