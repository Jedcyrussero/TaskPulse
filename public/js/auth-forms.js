/** Login + register page behaviour: inline validation, password UX, submit. */
import { AuthApi, tokenStore } from './api.js';
import { $, $$, el, showAlert, clearAlert } from './ui.js';

const form = $('#auth-form');
const alertBox = $('#form-alert');
const submitBtn = $('#submit-btn');
const btnLabel = submitBtn.querySelector('.btn-label') ?? submitBtn;
const isRegister = form.dataset.mode === 'register';
const idleLabel = isRegister ? 'Create account' : 'Sign in';

// Already signed in? Skip straight to the dashboard.
if (tokenStore.get()) {
  AuthApi.me()
    .then(() => { window.location.replace('/index.html'); })
    .catch(() => tokenStore.clear());
}

// --- Password visibility ----------------------------------------------------

for (const toggle of $$('[data-toggle-password]')) {
  toggle.addEventListener('click', () => {
    const input = $(`#${toggle.dataset.togglePassword}`);
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(reveal));
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    toggle.classList.toggle('on', reveal);
    input.focus();
  });
}

// --- Inline validation ------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rules per field. Each returns an error string, or null when valid. */
const RULES = {
  displayName: (v) => (v.trim() ? (v.trim().length > 80 ? 'Name must be 80 characters or fewer' : null) : 'Name is required'),
  email: (v) => (!v.trim() ? 'Email is required' : EMAIL_RE.test(v.trim()) ? null : 'Enter a valid email address'),
  password: (v) => {
    if (!v) return 'Password is required';
    if (!isRegister) return null; // length checks only matter when creating one
    if (v.length < 8) return 'Password must be at least 8 characters';
    if (v.length > 128) return 'Password is too long';
    return null;
  },
};

function feedbackFor(name) {
  return form.querySelector(`[data-feedback-for="${name}"]`);
}

/** Show (or clear) the inline error under a field. Returns true when valid. */
function validateField(input, { show = true } = {}) {
  const rule = RULES[input.name];
  if (!rule) return true;

  const error = rule(input.value);
  const fb = feedbackFor(input.name);

  if (show) {
    input.classList.toggle('invalid', Boolean(error));
    if (fb) {
      fb.textContent = error ?? '';
      fb.classList.toggle('show', Boolean(error));
    }
  }
  // Only fail validation on empty/invalid; never block a blank optional field.
  return !error;
}

function validateForm() {
  let firstInvalid = null;
  for (const input of form.elements) {
    if (!RULES[input.name]) continue;
    const ok = validateField(input);
    if (!ok && !firstInvalid) firstInvalid = input;
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

// Validate on blur, and live-clear the error once the user fixes it.
form.addEventListener('focusout', (event) => {
  if (RULES[event.target.name]) validateField(event.target);
});
form.addEventListener('input', (event) => {
  const input = event.target;
  if (!RULES[input.name]) return;
  if (input.classList.contains('invalid')) validateField(input);
});

// --- Password strength meter ------------------------------------------------

const strengthWrap = $('[data-strength]');
const strengthLabel = $('[data-strength-label]');
const passwordInput = form.elements.password;

if (isRegister && strengthWrap && passwordInput) {
  const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  const COLORS = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--info)', 'var(--success)'];

  passwordInput.addEventListener('input', () => {
    const value = passwordInput.value;
    strengthWrap.classList.toggle('show', value.length > 0);

    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    score = value ? Math.max(1, Math.min(4, score)) : 0;

    strengthWrap.querySelectorAll('.strength-bar').forEach((bar, i) => {
      bar.style.background = i < score ? COLORS[score] : 'var(--border)';
    });
    if (strengthLabel) {
      strengthLabel.textContent = value ? LABELS[score] : 'Use 8 or more characters.';
      strengthLabel.style.color = value ? COLORS[score] : '';
    }
  });
}

// --- Submit -----------------------------------------------------------------

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert(alertBox);

  if (!validateForm()) return;

  const data = Object.fromEntries(new FormData(form));
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  btnLabel.textContent = isRegister ? 'Creating account...' : 'Signing in...';

  try {
    const payload = isRegister
      ? {
          email: data.email,
          password: data.password,
          displayName: data.displayName,
          city: data.city || undefined,
          country: data.country || undefined,
        }
      : { email: data.email, password: data.password };

    const { accessToken } = isRegister
      ? await AuthApi.register(payload)
      : await AuthApi.login(payload);

    tokenStore.set(accessToken);
    // Brief success beat so the action feels acknowledged before navigating.
    alertBox.className = 'alert alert-success show';
    alertBox.textContent = isRegister ? 'Account created — welcome!' : 'Signed in — loading…';
    setTimeout(() => { window.location.href = '/index.html'; }, 450);
  } catch (err) {
    showAlert(alertBox, err.message, 'error', err.details);
    // Attach server-side field errors to the matching inputs.
    for (const detail of err.details ?? []) {
      const input = form.elements[detail.field];
      if (!input) continue;
      input.classList.add('invalid');
      const fb = feedbackFor(detail.field);
      if (fb) { fb.textContent = detail.message; fb.classList.add('show'); }
    }
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    btnLabel.textContent = idleLabel;
  }
});

// Prefill the demo account to make first-run exploration painless.
const demoBtn = $('#demo-fill');
if (demoBtn) {
  demoBtn.addEventListener('click', () => {
    form.elements.email.value = 'demo@taskpulse.app';
    form.elements.password.value = 'demo1234';
    clearAlert(alertBox);
    form.elements.email.focus();
  });
}
