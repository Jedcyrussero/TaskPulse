/** Shared auth state + header wiring for the authenticated pages. */
import { AuthApi, tokenStore } from './api.js';
import { $, el, initials, toast } from './ui.js';

let cachedUser = null;

export async function getUser(force = false) {
  if (cachedUser && !force) return cachedUser;
  const { user } = await AuthApi.me();
  cachedUser = user;
  return user;
}

/**
 * Guard a page: redirect to /login.html when signed out, otherwise render the
 * header with the current user and return them.
 */
export async function requireSession() {
  if (!tokenStore.get()) {
    window.location.replace('/login.html');
    return null;
  }

  let user;
  try {
    user = await getUser();
  } catch {
    tokenStore.clear();
    window.location.replace('/login.html');
    return null;
  }

  renderHeader(user);
  return user;
}

function renderHeader(user) {
  const nav = $('#nav');
  if (nav) {
    const current = window.location.pathname.replace(/index\.html$/, '') || '/';
    for (const link of nav.querySelectorAll('a')) {
      link.classList.toggle('active', link.getAttribute('href') === current);
    }
  }

  const slot = $('#user-slot');
  if (!slot) return;

  slot.replaceChildren(
    el('div', { class: 'user-chip' },
      el('span', { class: 'avatar' }, initials(user.displayName)),
      el('span', { class: 'name' }, user.displayName)),
    el('button', {
      class: 'btn btn-sm',
      type: 'button',
      onclick: async (event) => {
        event.currentTarget.disabled = true;
        try {
          await AuthApi.logout();
        } catch {
          /* the cookie is cleared regardless; continue to the login page */
        }
        tokenStore.clear();
        window.location.href = '/login.html';
      },
    }, 'Sign out'),
  );
}