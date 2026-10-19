/** Shared rendering + mutation helpers for a single task row. */
import { TaskApi } from './api.js';
import { el, STATUS_LABELS, PRIORITY_LABELS, formatDate, toast } from './ui.js';

export function renderTask(task, { onToggle, onEdit, onDelete } = {}) {
  const li = el('li', { class: `task${task.status === 'done' ? ' done' : ''}`, dataset: { id: task.id } });

  const checkbox = el('input', {
    type: 'checkbox',
    class: 'task-check',
    'aria-label': `Mark "${task.title}" as done`,
  });
  checkbox.checked = task.status === 'done';

  checkbox.addEventListener('change', async () => {
    checkbox.disabled = true;
    try {
      const { task: updated } = await TaskApi.toggle(task.id);
      onToggle ? onToggle(updated) : applyTaskState(li, updated);
    } catch (err) {
      checkbox.checked = !checkbox.checked; // revert on failure
      toast(err.message, 'error');
    } finally {
      checkbox.disabled = false;
    }
  });

  const meta = el('div', { class: 'task-meta' },
    el('span', { class: `badge badge-${task.status}` }, STATUS_LABELS[task.status] ?? task.status),
    el('span', { class: `badge badge-${task.priority}` }, PRIORITY_LABELS[task.priority] ?? task.priority),
  );

  const due = formatDate(task.due_date);
  if (due) {
    meta.append(
      due.tone
        ? el('span', { class: `badge badge-${due.tone}` }, `📅 ${due.text}`)
        : el('span', { class: 'field-hint' }, `📅 ${due.text}`),
    );
  }

  const main = el('div', { class: 'task-main' },
    el('div', { class: 'task-title' }, task.title),
    task.description ? el('div', { class: 'task-desc' }, task.description) : null,
    meta,
  );

  const actions = el('div', { class: 'task-actions' },
    el('button', {
      class: 'btn btn-sm',
      type: 'button',
      onclick: () => onEdit?.(task),
    }, 'Edit'),
    el('button', {
      class: 'btn btn-sm btn-danger',
      type: 'button',
      'aria-label': `Delete "${task.title}"`,
      onclick: () => onDelete?.(task),
    }, '✕'),
  );

  li.append(checkbox, main, actions);
  return li;
}

function applyTaskState(li, task) {
  li.classList.toggle('done', task.status === 'done');
  li.querySelector('.task-check').checked = task.status === 'done';
  const badge = li.querySelector('.badge');
  if (badge) {
    badge.className = `badge badge-${task.status}`;
    badge.textContent = STATUS_LABELS[task.status] ?? task.status;
  }
}

export function emptyState(message, hint) {
  return el('li', { class: 'empty' },
    el('div', { class: 'empty-icon' }, '🗒️'),
    el('h3', {}, message),
    hint ? el('p', {}, hint) : null);
}