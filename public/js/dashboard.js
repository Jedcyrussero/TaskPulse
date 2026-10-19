/** Dashboard: stats, 14-day activity chart, upcoming list, weather widget. */
import { DashboardApi, WeatherApi, AuthApi } from './api.js';
import { requireSession } from './auth.js';
import { $, el, toast, formatDate, STATUS_LABELS, PRIORITY_LABELS } from './ui.js';
import { renderTask, emptyState } from './task-item.js';

const WEATHER_ICONS = {
  clear: '☀️',
  cloud: '⛅',
  rain: '🌧️',
  snow: '❄️',
  storm: '⛈️',
  fog: '🌫️',
  wind: '💨',
};

let user = null;

async function init() {
  user = await requireSession();
  if (!user) return;

  renderGreeting();
  await Promise.all([loadStats(), loadWeather()]);

  $('#refresh-btn').addEventListener('click', async () => {
    await Promise.all([loadStats(), loadWeather()]);
    toast('Dashboard refreshed', 'info');
  });
}

function renderGreeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = `${part}, ${user.displayName.split(' ')[0]}`;
}

// --- Stats ------------------------------------------------------------------

async function loadStats() {
  try {
    const stats = await DashboardApi.summary();
    renderStatTiles(stats.totals);
    renderProgress(stats.totals);
    renderChart(stats.trend);
    renderPriorityBreakdown(stats.byPriority, stats.totals.total);
    renderUpcoming(stats.upcoming);
    renderActivity(stats.recentActivity);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderStatTiles(t) {
  const tiles = [
    { label: 'Total tasks', value: t.total, hint: `${t.todo} to do`, accent: 'var(--primary)' },
    { label: 'Completed', value: t.done, hint: `${t.completionRate}% of all tasks`, accent: 'var(--success)' },
    { label: 'In progress', value: t.inProgress, hint: 'Being worked on now', accent: 'var(--warning)' },
    { label: 'Overdue', value: t.overdue, hint: t.overdue ? 'Needs attention' : 'All clear', accent: t.overdue ? 'var(--danger)' : 'var(--success)' },
    { label: 'Due this week', value: t.dueThisWeek, hint: `${t.completedToday} done today`, accent: 'var(--info)' },
  ];

  $('#stat-grid').replaceChildren(
    ...tiles.map((tile) => el('div', { class: 'stat', style: `--accent:${tile.accent}` },
      el('div', { class: 'stat-label' }, tile.label),
      el('div', { class: 'stat-value' }, tile.value),
      el('div', { class: 'stat-hint' }, tile.hint))),
  );
}

function renderProgress(t) {
  $('#progress-fill').style.width = `${t.completionRate}%`;
  $('#progress-text').textContent = `${t.completionRate}% complete`;
}

function renderPriorityBreakdown(byPriority, total) {
  const open = Object.values(byPriority).reduce((a, b) => a + b, 0);

  $('#priority-bars').replaceChildren(
    ...['urgent', 'high', 'medium', 'low'].map((level) => {
      const count = byPriority[level] ?? 0;
      const pct = open ? Math.round((count / open) * 100) : 0;
      return el('div', { style: 'margin-bottom:12px' },
        el('div', { style: 'display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px' },
          el('span', { class: `badge badge-${level}` }, PRIORITY_LABELS[level]),
          el('span', { style: 'color:var(--text-muted)' }, `${count} · ${pct}%`)),
        el('div', { class: 'progress' },
          el('div', {
            class: 'progress-fill',
            style: `width:${pct}%;background:var(--${
              { urgent: 'danger', high: 'warning', medium: 'info', low: 'text-dim' }[level]
            })`,
          })));
    }),
    open === 0
      ? el('p', { class: 'field-hint', style: 'margin-top:6px' },
          `No open tasks out of ${total} total.`)
      : null,
  );
}

function renderChart(trend) {
  const max = Math.max(1, ...trend.map((d) => Math.max(d.created, d.completed)));

  $('#chart').replaceChildren(
    ...trend.map((day) => el('div', {
      class: 'chart-col',
      title: `${day.day}: ${day.created} created, ${day.completed} completed`,
    },
      el('div', {
        class: 'chart-bar chart-bar-completed',
        style: `height:${Math.round((day.completed / max) * 45)}%`,
      }),
      el('div', {
        class: 'chart-bar chart-bar-created',
        style: `height:${Math.round((day.created / max) * 45)}%`,
      }))),
  );

  $('#chart-labels').replaceChildren(
    ...trend.map((day, i) => el('div', { class: 'chart-label' },
      // Label sparsely to avoid crowding on narrow screens.
      i % 2 === 0 ? day.day.slice(5) : '')),
  );
}

function renderUpcoming(upcoming) {
  const list = $('#upcoming-list');
  if (!upcoming.length) {
    list.replaceChildren(emptyState('Nothing scheduled', 'Add a due date to a task and it will show up here.'));
    return;
  }
  list.replaceChildren(
    ...upcoming.map((task) => renderTask(task, {
      onToggle: () => { loadStats(); },
      onEdit: (t) => { window.location.href = `/tasks.html?edit=${t.id}`; },
      onDelete: () => { window.location.href = '/tasks.html'; },
    })),
  );
}

function renderActivity(activity) {
  const list = $('#activity-list');
  if (!activity.length) {
    list.replaceChildren(emptyState('No completed tasks yet', 'Finish something and it will be recorded here.'));
    return;
  }

  list.replaceChildren(
    ...activity.map((task) => {
      const when = formatDate(task.completed_at);
      return el('li', { class: 'task' },
        el('div', { class: 'task-main' },
          el('div', { class: 'task-title' }, task.title),
          el('div', { class: 'task-meta' },
            el('span', { class: 'badge badge-done' }, STATUS_LABELS.done),
            el('span', { class: 'field-hint' }, when?.text ?? ''))));
    }),
  );
}

// --- Weather ----------------------------------------------------------------

async function loadWeather() {
  const host = $('#weather');
  host.replaceChildren(
    el('div', { class: 'inline-loading' }, el('span', { class: 'spinner' }), 'Loading weather...'),
  );

  try {
    const weather = await WeatherApi.current();

    if (!weather.available) {
      host.className = 'card';
      host.replaceChildren(
        el('div', { class: 'card-body' },
          el('div', { class: 'weather-unavailable' },
            el('span', { style: 'font-size:1.5rem' }, '🌤️'),
            el('div', {},
              el('div', { style: 'font-weight:600;color:var(--text)' }, 'Weather unavailable'),
              el('div', { class: 'field-hint' }, 'Add WEATHER_API_KEY to your .env to enable local conditions.'),
              el('button', {
                class: 'btn btn-sm',
                style: 'margin-top:10px',
                type: 'button',
                onclick: () => setCity(),
              }, 'Set your city')))),
      );
      return;
    }

    const unit = weather.units === 'imperial' ? '°F' : '°C';
    const windUnit = weather.units === 'imperial' ? 'mph' : 'm/s';

    host.className = 'card';
    host.replaceChildren(
      el('div', { class: 'card-body' },
        el('div', { class: 'weather' },
          el('div', { class: 'weather-icon', 'aria-hidden': 'true' }, WEATHER_ICONS[weather.icon] ?? '⛅'),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap' },
              el('span', { class: 'weather-temp' }, weather.temperature, el('sup', {}, unit)),
              el('div', {},
                el('div', { class: 'weather-loc' },
                  `${weather.location}${weather.country ? `, ${weather.country}` : ''}`),
                el('div', { class: 'weather-desc' }, weather.description))),
            el('div', { class: 'weather-facts' },
              weather.feelsLike !== null
                ? el('span', { class: 'weather-fact' }, 'Feels like ', el('b', {}, `${weather.feelsLike}${unit}`))
                : null,
              weather.humidity !== null
                ? el('span', { class: 'weather-fact' }, 'Humidity ', el('b', {}, `${weather.humidity}%`))
                : null,
              weather.windSpeed !== null
                ? el('span', { class: 'weather-fact' }, 'Wind ', el('b', {}, `${weather.windSpeed} ${windUnit}`))
                : null)),
          el('button', {
            class: 'btn btn-sm',
            type: 'button',
            onclick: () => setCity(weather.location),
          }, 'Change'))),
    );
  } catch (err) {
    host.className = 'card';
    host.replaceChildren(
      el('div', { class: 'card-body' },
        el('div', { class: 'weather-unavailable' },
          el('span', { style: 'font-size:1.5rem' }, '⚠️'),
          el('div', {},
            el('div', { style: 'font-weight:600;color:var(--text)' }, 'Could not load weather'),
            el('div', { class: 'field-hint' }, err.message)))),
    );
  }
}

async function setCity(defaultCity = '') {
  const city = window.prompt('City for local weather:', defaultCity || user.city || '');
  if (!city || !city.trim()) return;

  try {
    await AuthApi.updateProfile({ city: city.trim() });
    user.city = city.trim();
    toast(`Weather location set to ${city.trim()}`);
    loadWeather();
  } catch (err) {
    toast(err.message, 'error');
  }
}

init();