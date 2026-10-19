/** Login + register page behaviour. */
import { AuthApi, tokenStore } from './api.js';
import { $, showAlert, clearAlert } from './ui.js';

const form = $('#auth-form');
const alertBox = $('#form-alert');
const submitBtn = $('#submit-btn');

// Already signed in? Skip straight to the dashboard.
if (tokenStore.get()) {
  AuthApi.me()
    .then(() => { window.location.replace('/index.html'); })
    .catch(() => tokenStore.clear());
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert(alertBox);

  const data = Object.fromEntries(new FormData(form));
  const mode = form.dataset.mode;

  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'login' ? 'Signing in...' : 'Creating account...';

  try {
    const payload =
      mode === 'login'
        ? { email: data.email, password: data.password }
        : {
            email: data.email,
            password: data.password,
            displayName: data.displayName,
            city: data.city || undefined,
            country: data.country || undefined,
          };

    const { accessToken } = mode === 'login' ? await AuthApi.login(payload) : await AuthApi.register(payload);
    tokenStore.set(accessToken);
    window.location.href = '/index.html';
  } catch (err) {
    showAlert(alertBox, err.message, 'error', err.details);
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
  }
});

// Prefill the demo account to make first-run exploration painless.
const demoBtn = $('#demo-fill');
if (demoBtn) {
  demoBtn.addEventListener('click', () => {
    form.elements.email.value = 'demo@taskpulse.app';
    form.elements.password.value = 'demo1234';
    form.elements.email.focus();
  });
}