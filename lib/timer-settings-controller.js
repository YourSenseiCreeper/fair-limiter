((root) => {
  function createTimerSettingsController(document, runtime, storage, format, toast) {
    const slider = document.getElementById('timer-slider');
    const badge = document.getElementById('timer-val-badge');
    const warnToggle = document.getElementById('toggle-warn');
    const warningSlider = document.getElementById('warning-minutes-slider');
    const warningBadge = document.getElementById('warning-minutes-badge');
    const warningWrap = document.getElementById('warning-minutes-wrap');
    const closeToggle = document.getElementById('toggle-close-tab');
    const graceToggle = document.getElementById('toggle-grace');
    const rolloverToggle = document.getElementById('toggle-rollover');
    const rolloverCapSlider = document.getElementById('rollover-cap-slider');
    const rolloverCapBadge = document.getElementById('rollover-cap-badge');
    const rolloverCapWrap = document.getElementById('rollover-cap-wrap');
    const rolloverCurrent = document.getElementById('rollover-current');
    const rolloverDaysWrap = document.getElementById('rollover-days-wrap');
    const rolloverDayInputs = [1, 2, 3, 4, 5, 6, 0]
      .map(day => ({ day, input: document.getElementById(`rollover-day-${day}`) }));
    const saveButton = document.getElementById('save-timer');

    function updateRolloverControls() {
      const enabled = rolloverToggle.checked;
      rolloverCapSlider.disabled = !enabled;
      rolloverCapWrap.classList.toggle('disabled', !enabled);
      rolloverDaysWrap.classList.toggle('disabled', !enabled);
      rolloverDayInputs.forEach(({ input }) => { input.disabled = !enabled; });
    }

    function updateWarningControls() {
      warningSlider.disabled = !warnToggle.checked;
      warningWrap.classList.toggle('disabled', !warnToggle.checked);
    }

    updateRolloverControls();
    updateWarningControls();

    runtime.sendMessage({ type: 'GET_STATE' }, state => {
      if (!state) return;
      const minutes = Math.round((state.limitMs ?? 3600000) / 60000);
      slider.value = minutes;
      badge.textContent = format.used(minutes * 60000);
      const rolloverCapMinutes = Math.round((state.rolloverDailyCapMs ?? 1800000) / 60000);
      rolloverToggle.checked = state.rolloverEnabled ?? false;
      rolloverCapSlider.value = rolloverCapMinutes;
      rolloverCapBadge.textContent = format.used(rolloverCapMinutes * 60000);
      rolloverCurrent.textContent = `Currently saved: ${format.used(state.rolloverRemainingMs ?? 0)} of 1h 30m`;
      const selectedDays = root.YtLimiterTime.normalizeRolloverDays(state.rolloverDays);
      rolloverDayInputs.forEach(({ day, input }) => { input.checked = selectedDays.includes(day); });
      updateRolloverControls();
    });

    storage.get(['timerWarn', 'timerWarnMinutes', 'timerCloseTab', 'timerGrace'], data => {
      warnToggle.checked = data.timerWarn ?? true;
      const warningMinutes = Number(data.timerWarnMinutes);
      warningSlider.value = Number.isFinite(warningMinutes)
        ? Math.min(15, Math.max(1, Math.round(warningMinutes))) : 1;
      warningBadge.textContent = `${warningSlider.value}m`;
      closeToggle.checked = data.timerCloseTab ?? true;
      graceToggle.checked = data.timerGrace ?? true;
      updateWarningControls();
    });

    slider.addEventListener('input', () => {
      badge.textContent = format.used(slider.value * 60000);
    });
    rolloverToggle.addEventListener('change', updateRolloverControls);
    warnToggle.addEventListener('change', updateWarningControls);
    warningSlider.addEventListener('input', () => {
      warningBadge.textContent = `${warningSlider.value}m`;
    });
    rolloverCapSlider.addEventListener('input', () => {
      rolloverCapBadge.textContent = format.used(rolloverCapSlider.value * 60000);
    });

    saveButton.addEventListener('click', () => {
      const limitMs = parseInt(slider.value, 10) * 60000;
      runtime.sendMessage({ type: 'SET_LIMIT', limitMs }, () => {
        runtime.sendMessage({
          type: 'SET_ROLLOVER',
          enabled: rolloverToggle.checked,
          dailyCapMs: parseInt(rolloverCapSlider.value, 10) * 60000,
          days: rolloverDayInputs.filter(({ input }) => input.checked).map(({ day }) => day)
        }, () => storage.set({
          timerWarn: warnToggle.checked,
          timerWarnMinutes: parseInt(warningSlider.value, 10),
          timerCloseTab: closeToggle.checked,
          timerGrace: graceToggle.checked
        }, () => toast('✓ Timer settings saved')));
      });
    });
  }

  root.YtLimiterTimerSettings = Object.freeze({ createTimerSettingsController });
})(globalThis);
