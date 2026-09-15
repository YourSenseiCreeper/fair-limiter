// Composition root for popup state and extension actions.
const popupView = YtLimiterPopupView.createPopupView(document, YtLimiterFormat);

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, state => {
    if (state) popupView.render(state);
  });
}

let graceChangedAfterOpen = false;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.timerGrace) return;
  graceChangedAfterOpen = true;
  popupView.showGrace(changes.timerGrace.newValue ?? true);
});
chrome.storage.local.get('timerGrace', data => {
  if (!graceChangedAfterOpen) popupView.showGrace(data.timerGrace ?? true);
});

loadState();
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'STATE_UPDATE') loadState();
});

popupView.graceButton.addEventListener('click', () => {
  popupView.graceButton.disabled = true;
  chrome.runtime.sendMessage({ type: 'GRANT_EXTRA' }, loadState);
});
document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById('btn-history').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html#history') });
});
