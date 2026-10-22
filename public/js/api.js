/**
 * Thin fetch wrapper around the TaskPulse API.
 * Handles JSON encoding, error shaping, and transparent access-token refresh.
 */

const ACCESS_KEY = 'tp_access';
const REFRESH_URL = '/api/auth/refresh';

let refreshPromise = null;

export const tokenStore = {
  get: () => localStorage.getItem(ACCESS_KEY),
  set: (token) => localStorage.setItem(ACCESS_KEY, token),
  clear: () => localStorage.removeItem(ACCESS_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Attempt a refresh exactly once even if several requests race. */
async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(REFRESH_URL, {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, 'Session expired');
        const data = await res.json();
        tokenStore.set(data.accessToken);
        return data.accessToken;
      })
      .catch((err) => {
        tokenStore.clear();
        window.location.href = '/login.html';
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function request(method, path, { body, query, retry = true } = {}) {
  let url = `/api${path}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
      else params.set(key, value);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const token = tokenStore.get();
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // One retry with a fresh access token after a 401.
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    await refreshAccessToken();
    return request(method, path, { body, query, retry: false });
  }

  const payload = await parse(res);

  if (!res.ok) {
    const message = payload?.error?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, payload?.error?.details);
  }

  return payload;
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path),
};

// --- Endpoint helpers -------------------------------------------------------

export const AuthApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (payload) => api.patch('/auth/me', payload),
};

export const TaskApi = {
  list: (query) => api.get('/tasks', query),
  create: (payload) => api.post('/tasks', payload),
  update: (id, payload) => api.patch(`/tasks/${id}`, payload),
  toggle: (id) => api.post(`/tasks/${id}/toggle`),
  remove: (id) => api.delete(`/tasks/${id}`),
};

export const DashboardApi = {
  summary: () => api.get('/dashboard/summary'),
};

export const WeatherApi = {
  current: (city, country) =>
    api.get('/weather', city ? { city, ...(country ? { country } : {}) } : undefined),
};