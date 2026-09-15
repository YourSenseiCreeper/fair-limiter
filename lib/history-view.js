// The history controller owns chart rendering and its range control only.
((root) => {
  function createHistoryController(document, runtime, format, historyDates, dateNow) {
    let range = 'week';
    const localDateKey = historyDates.localDateKey;

    function renderHeatmap(chart, days, values, today) {
      chart.className = 'year-chart';
      chart.setAttribute('aria-label', 'YouTube watch time for the last 8 months');

      const startOffset = (days[0].getDay() + 6) % 7;
      const weekCount = Math.ceil((startOffset + days.length) / 7);
      const max = Math.max(...values, 1);
      const scroll = document.createElement('div');
      scroll.className = 'heatmap-scroll';
      const content = document.createElement('div');
      content.className = 'heatmap-content';
      content.style.setProperty('--week-count', weekCount);

      const months = document.createElement('div');
      months.className = 'heatmap-months';
      const labelledMonths = new Set();
      days.forEach((date, index) => {
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        if (labelledMonths.has(monthKey)) return;
        labelledMonths.add(monthKey);
        const label = document.createElement('span');
        label.className = 'heatmap-month';
        label.style.gridColumn = String(Math.floor((startOffset + index) / 7) + 1);
        label.textContent = date.toLocaleDateString(undefined, { month: 'short' });
        months.appendChild(label);
      });

      const body = document.createElement('div');
      body.className = 'heatmap-body';
      const weekdays = document.createElement('div');
      weekdays.className = 'heatmap-weekdays';
      ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach(label => {
        const day = document.createElement('span');
        day.textContent = label;
        weekdays.appendChild(day);
      });

      const grid = document.createElement('div');
      grid.className = 'heatmap-grid';
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-label', 'YouTube watch time for the last 8 months');
      const todayKey = localDateKey(today);
      days.forEach((date, index) => {
        const value = values[index];
        const dateKey = localDateKey(date);
        const level = value ? Math.min(4, Math.ceil(value / max * 4)) : 0;
        const tooltip = `${date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}: ${format.exact(value)}`;
        const cell = document.createElement('div');
        cell.className = `heatmap-cell${dateKey === todayKey ? ' today' : ''}`;
        cell.dataset.level = String(level);
        cell.style.gridColumn = String(Math.floor((startOffset + index) / 7) + 1);
        cell.style.gridRow = String(((date.getDay() + 6) % 7) + 1);
        cell.title = tooltip;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', tooltip);
        grid.appendChild(cell);
      });

      body.append(weekdays, grid);
      content.append(months, body);
      scroll.appendChild(content);

      const legend = document.createElement('div');
      legend.className = 'heatmap-legend';
      const less = document.createElement('span');
      less.textContent = 'Less';
      legend.appendChild(less);
      for (let level = 0; level <= 4; level++) {
        const swatch = document.createElement('span');
        swatch.className = 'heatmap-cell';
        swatch.dataset.level = String(level);
        swatch.setAttribute('aria-hidden', 'true');
        legend.appendChild(swatch);
      }
      const more = document.createElement('span');
      more.textContent = 'More';
      legend.appendChild(more);
      chart.append(scroll, legend);
    }

    function renderBars(chart, days, values, max, today) {
      chart.className = `chart ${range}`;
      chart.setAttribute('aria-label', `Daily YouTube watch time for the last ${days.length} days`);
      days.forEach((date, index) => {
        const value = values[index];
        const column = document.createElement('div');
        column.className = `chart-column${localDateKey(date) === localDateKey(today) ? ' today' : ''}`;
        column.title = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${format.exact(value)}`;

        const valueLabel = document.createElement('span');
        valueLabel.className = 'chart-value';
        valueLabel.textContent = value ? format.used(value) : '–';
        const track = document.createElement('div');
        track.className = 'chart-track';
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = `${value ? Math.max(3, value / max * 100) : 0}%`;
        track.appendChild(bar);
        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = range === 'week'
          ? date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)
          : (index % 5 === 0 || index === days.length - 1 ? date.getDate() : '');
        column.append(valueLabel, track, label);
        chart.appendChild(column);
      });
    }

    function render(history) {
      const today = dateNow();
      const days = historyDates.days(range, today);
      const values = days.map(date => history[localDateKey(date)] ?? 0);
      const max = Math.max(...values, 1);
      const total = values.reduce((sum, value) => sum + value, 0);
      const active = values.filter(value => value > 0).length;
      const chart = document.getElementById('history-chart');
      chart.textContent = '';
      if (range === 'year') renderHeatmap(chart, days, values, today);
      else renderBars(chart, days, values, max, today);

      document.getElementById('history-total').textContent = format.used(total);
      document.getElementById('history-period').textContent = range === 'year'
        ? 'Last 8 months' : range === 'week' ? 'Last 7 days' : 'Last 30 days';
      document.getElementById('history-average').textContent = format.used(total / days.length);
      document.getElementById('history-longest').textContent = format.used(Math.max(...values));
      document.getElementById('history-active').textContent = String(active);
    }

    function load() {
      runtime.sendMessage({ type: 'GET_HISTORY' }, data => render(data?.history ?? {}));
    }

    document.querySelectorAll('.range-btn').forEach(button => {
      button.addEventListener('click', () => {
        range = button.dataset.range;
        document.querySelectorAll('.range-btn').forEach(item => item.classList.toggle('active', item === button));
        load();
      });
    });

    return Object.freeze({ load });
  }

  root.YtLimiterHistoryView = Object.freeze({ createHistoryController });
})(globalThis);
