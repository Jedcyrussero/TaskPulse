/** Small DOM helpers + shared UI primitives. */

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** Create an element with attributes and children in one call. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

// --- Alerts -----------------------------------------------------------------

export function showAlert(container, message, kind = 'error', details) {
  if (!container) return;
  container.className = `alert alert-${kind} show`;
  container.textContent = message;

  if (details?.length) {
    container.append(
      el('ul', {}, details.map((d) => el('li', {}, `${d.field}: ${d.message}`))),
    );
  }
}

export function clearAlert(container) {
  if (!container) return;
  container.className = 'alert';
  container.textContent = '';
}

// --- Toasts -----------------------------------------------------------------

function toastHost() {
  let host = $('#toast-host');
  if (!host) {
    host = el('div', {
      id: 'toast-host',
      style: 'position:fixed;bottom:20px;right:20px;z-index:200;display:flex;flex-direction:column;gap:8px;',
    });
    document.body.append(host);
  }
  return host;
}

export function toast(message, kind = 'success') {
  const colors = {
    success: 'var(--success-soft)',
    error: 'var(--danger-soft)',
    info: 'var(--info-soft)',
  };
  const borders = {
    success: 'rgba(52,211,153,.4)',
    error: 'rgba(248,113,113,.4)',
    info: 'rgba(56,189,248,.4)',
  };

  const node = el('div', {
    style: `padding:11px 16px;border-radius:var(--radius-sm);background:${colors[kind]};`
      + `border:1px solid ${borders[kind]};font-size:.88rem;box-shadow:var(--shadow);`
      + 'max-width:320px;animation:pop .16s ease;',
  }, message);

  toastHost().append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 300);
  }, 3200);
}

// --- Formatting -------------------------------------------------------------

export const STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - startOfToday) / 86_400_000);

  const base = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (diffDays === 0) return { text: 'Today', tone: 'due-soon' };
  if (diffDays === 1) return { text: 'Tomorrow', tone: 'due-soon' };
  if (diffDays === -1) return { text: 'Yesterday', tone: 'due-soon' };
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, tone: 'overdue' };
  if (diffDays <= 7) return { text: `In ${diffDays}d`, tone: 'due-soon' };
  return { text: base, tone: '' };
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Wrap a label/badge pair for a task meta row. */
export function badge(kind, value, label) {
  return el('span', { class: `badge badge-${kind}` }, label ?? value);
}