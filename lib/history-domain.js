// Date selection stays independent of the chart and Chrome storage.
((root) => {
  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function days(range, today) {
    if (range === 'year') {
      const result = [];
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 7, 1);
      for (const date = firstDay; date <= today; date.setDate(date.getDate() + 1)) {
        result.push(new Date(date));
      }
      return result;
    }

    const count = range === 'month' ? 30 : 7;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (count - 1 - index));
      return date;
    });
  }

  root.YtLimiterHistory = Object.freeze({ localDateKey, days });
})(globalThis);
