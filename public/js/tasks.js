/** Tasks page: filterable, sortable, paginated list with a create/edit modal. */
import { TaskApi } from './api.js';
import { requireSession } from './auth.js';
import { $, el, toast, showAlert, clearAlert } from './ui.js';
import { renderTask, emptyState } from './task-item.js';

const state = {
  page: 1,
  pageSize: 10,
  sort: 'created_at',
  order: 'desc',
  status: [],
  priority: [],
  search: '',
  due: '',
  pagination: null,
};

// --- Elements ---------------------------------------------------------------

const listEl = $('#task-list');
const alertBox = $('#list-alert');
const modal = $('#task-modal');
const form = $('#task-form');
const modalTitle = $('#modal-title');
const submitBtn = $('#modal-submit');

let editingId = null;
let searchTimer = null;

// --- Data -------------------------------------------------------------------

async function loadTasks() {
  listEl.setAttribute('aria-busy', 'true');
  listEl.replaceChildren(
    el('li', { class: 'empty' },
      el('div', { class: 'inline-loading', style: 'justify-content:center' },
        el('span', { class: 'spinner' }), 'Loading tasks...')),
  );

  try {
    const data = await TaskApi.list({
      page: state.page,
      pageSize: state.pageSize,
      sort: state.sort,
      order: state.order,
      status: state.status.length ? state.status : undefined,
      priority: state.priority.length ? state.priority : undefined,
      search: state.search || undefined,
      due: state.due || undefined,
    });

    state.pagination = data.pagination;
    render(data.items, data.pagination);
    clearAlert(alertBox);
  } catch (err) {
    listEl.replaceChildren(emptyState('Could not load tasks', err.message));
    showAlert(alertBox, err.message, 'error', err.details);
  } finally {
    listEl.removeAttribute('aria-busy');
  }
}

function render(items, pagination) {
  if (!items.length) {
    listEl.replaceChildren(
      emptyState(
        hasFilters() ? 'No tasks match these filters' : 'No tasks yet',
        hasFilters() ? 'Try clearing a filter or two.' : 'Create your first task with the button above.',
      ),
    );
  } else {
    listEl.replaceChildren(
      ...items.map((task) => renderTask(task, {
        onToggle: () => loadTasks(),
        onEdit: openEdit,
        onDelete: confirmDelete,
      })),
    );
  }

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

  $('#list-summary').textContent =
    pagination.total === 0 ? 'No tasks' : `Showing ${from}–${to} of ${pagination.total}`;

  $('#page-info').textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
  $('#prev-page').disabled = pagination.page <= 1;
  $('#next-page').disabled = pagination.page >= pagination.totalPages;
}

function hasFilters() {
  return state.search || state.due || state.status.length || state.priority.length;
}

async function confirmDelete(task) {
  if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
  try {
    await TaskApi.remove(task.id);
    toast('Task deleted');
    // Step back a page if we just removed the last row on it.
    if (state.pagination && state.page > 1
        && (state.page - 1) * state.pageSize >= state.pagination.total - 1) {
      state.page -= 1;
    }
    loadTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- Modal ------------------------------------------------------------------

function openCreate() {
  editingId = null;
  modalTitle.textContent = 'New task';
  submitBtn.textContent = 'Create task';
  form.reset();
  form.elements.priority.value = 'medium';
  form.elements.status.value = 'todo';
  clearAlert($('#modal-alert'));
  modal.classList.add('open');
  form.elements.title.focus();
}

function openEdit(task) {
  editingId = task.id;
  modalTitle.textContent = 'Edit task';
  submitBtn.textContent = 'Save changes';
  clearAlert($('#modal-alert'));

  form.elements.title.value = task.title ?? '';
  form.elements.description.value = task.description ?? '';
  form.elements.status.value = task.status ?? 'todo';
  form.elements.priority.value = task.priority ?? 'medium';
  form.elements.dueDate.value = toDateInput(task.due_date);

  modal.classList.add('open');
  form.elements.title.focus();
}

function closeModal() {
  modal.classList.remove('open');
  editingId = null;
}

/** `<input type="date">` needs a plain YYYY-MM-DD in local time. */
function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const modalAlert = $('#modal-alert');
  clearAlert(modalAlert);

  const data = Object.fromEntries(new FormData(form));
  const payload = {
    title: data.title,
    description: data.description || undefined,
    status: data.status,
    priority: data.priority,
    dueDate: data.dueDate || null,
  };

  submitBtn.disabled = true;
  try {
    if (editingId) {
      await TaskApi.update(editingId, payload);
      toast('Task updated');
    } else {
      await TaskApi.create(payload);
      toast('Task created');
      state.page = 1; // jump back so the new task is visible
    }
    closeModal();
    loadTasks();
  } catch (err) {
    showAlert(modalAlert, err.message, 'error', err.details);
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Filters ----------------------------------------------------------------

function readFilters() {
  state.status = $('#filter-status').value ? [$('#filter-status').value] : [];
  state.priority = $('#filter-priority').value ? [$('#filter-priority').value] : [];
  state.due = $('#filter-due').value;
  state.order = $('#sort').dataset.direction === 'asc' ? 'asc' : 'desc';
  state.page = 1;
  loadTasks();
}

function bindFilters() {
  $('#filter-status').addEventListener('change', readFilters);
  $('#filter-priority').addEventListener('change', readFilters);
  $('#filter-due').addEventListener('change', readFilters);

  $('#sort').addEventListener('click', () => {
    const btn = $('#sort');
    const isAsc = btn.dataset.direction === 'asc';
    btn.dataset.direction = isAsc ? 'desc' : 'asc';
    btn.textContent = isAsc ? 'Newest' : 'Oldest';
    readFilters();
  });

  $('#search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = event.target.value.trim();
      readFilters();
    }, 320);
  });

  $('#clear-filters').addEventListener('click', () => {
    $('#filter-status').value = '';
    $('#filter-priority').value = '';
    $('#filter-due').value = '';
    $('#search').value = '';
    state.search = '';
    readFilters();
  });

  $('#new-task').addEventListener('click', openCreate);
  modal.querySelector('[data-close]').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  $('#prev-page').addEventListener('click', () => { state.page -= 1; loadTasks(); });
  $('#next-page').addEventListener('click', () => { state.page += 1; loadTasks(); });
}

// --- Init -------------------------------------------------------------------

async function init() {
  if (!(await requireSession())) return;
  bindFilters();

  // Deep link from the dashboard: /tasks.html?edit=12
  const editId = new URLSearchParams(window.location.search).get('edit');
  if (editId) {
    try {
      const { task } = await TaskApi.list({ pageSize: 100 });
      const match = task.items.find((t) => String(t.id) === editId);
      if (match) openEdit(match);
    } catch {
      /* fall through to the normal list view */
    }
  }

  loadTasks();
}

init();