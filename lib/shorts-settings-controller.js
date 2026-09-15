((root) => {
  function createShortsSettingsController(document, runtime, toast) {
    const hideToggle = document.getElementById('toggle-hide-sections');
    const blockToggle = document.getElementById('toggle-block-playback');
    const saveBar = document.getElementById('save-bar-shorts');
    const saveButton = document.getElementById('save-shorts');
    const discardButton = document.getElementById('discard-shorts');
    let savedHide = false;
    let savedBlock = false;

    runtime.sendMessage({ type: 'GET_SHORTS' }, data => {
      if (!data) return;
      hideToggle.checked = savedHide = data.hideSections;
      blockToggle.checked = savedBlock = data.blockPlayback;
    });

    function checkChanged() {
      const changed = hideToggle.checked !== savedHide || blockToggle.checked !== savedBlock;
      saveBar.classList.toggle('hidden', !changed);
    }

    hideToggle.addEventListener('change', checkChanged);
    blockToggle.addEventListener('change', checkChanged);
    saveButton.addEventListener('click', () => {
      runtime.sendMessage({
        type: 'SET_SHORTS',
        hideSections: hideToggle.checked,
        blockPlayback: blockToggle.checked
      }, () => {
        savedHide = hideToggle.checked;
        savedBlock = blockToggle.checked;
        saveBar.classList.add('hidden');
        toast('✓ Shorts settings saved', 'var(--violet2)');
      });
    });
    discardButton.addEventListener('click', () => {
      hideToggle.checked = savedHide;
      blockToggle.checked = savedBlock;
      saveBar.classList.add('hidden');
    });
  }

  root.YtLimiterShortsSettings = Object.freeze({ createShortsSettingsController });
})(globalThis);
