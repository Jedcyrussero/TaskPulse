/**
 * Smoke-test the request pipeline (middleware, validation, auth guard) against
 * a running server. Does not require a database: every assertion either stops
 * before the DB call or expects a 503 once it reaches it.
 *
 *   npm start          # in one terminal
 *   node scripts/smoke.mjs
 */
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Pull the same secret the server booted with.
const envText = fs.readFileSync('.env', 'utf8');
const secret = envText.match(/^JWT_ACCESS_SECRET=(.+)$/m)?.[1]?.trim();

if (!secret) {
  console.error('JWT_ACCESS_SECRET not found in .env');
  process.exit(1);
}

const token = jwt.sign(
  { sub: '1', email: 'smoke@test.local', name: 'Smoke Test', typ: 'access' },
  secret,
  { issuer: 'taskpulse', expiresIn: '5m' },
);

let passed = 0;
let failed = 0;

async function check(name, path, { method = 'GET', body, auth = true, expect, rawToken }) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(rawToken ? { authorization: `Bearer ${rawToken}` } : {}),
      ...(auth && !rawToken ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => null);
  const ok = expect.includes(res.status);
  const mark = ok ? 'PASS' : 'FAIL';

  if (ok) passed += 1;
  else failed += 1;

  console.log(`${mark}  ${name}  ->  ${res.status} (expected ${expect.join('|')})`);
  if (!ok) console.log(`      ${JSON.stringify(payload)?.slice(0, 200)}`);
}

// Auth guard
await check('no token is rejected', '/tasks', { auth: false, expect: [401] });
await check('garbage token is rejected', '/tasks', {
  auth: false,
  rawToken: 'not.a.jwt',
  expect: [401],
});
await check('token signed with the wrong secret is rejected', '/tasks', {
  auth: false,
  rawToken: jwt.sign({ sub: '1', typ: 'access' }, 'wrong-secret', { issuer: 'taskpulse' }),
  expect: [401],
});
await check('valid token passes the guard', '/tasks', {
  expect: [200, 503], // 503 once it reaches the (absent) database
});

// Query validation. These must 400 BEFORE any DB access.
await check('unknown status filter rejected', '/tasks?status=bogus', { expect: [400] });
await check('non-numeric page rejected', '/tasks?page=abc', { expect: [400] });
await check('oversized pageSize rejected', '/tasks?pageSize=9999', { expect: [400] });
await check('unknown sort column rejected', '/tasks?sort=id;DROP', { expect: [400] });
await check('valid filters pass validation', '/tasks?status=todo&due=overdue&page=2&sort=due_date', {
  expect: [200, 503],
});
await check('repeated status params accepted', '/tasks?status=todo&status=done', {
  expect: [200, 503],
});

// Body validation
await check('task without title rejected', '/tasks', {
  method: 'POST', body: { status: 'todo' }, expect: [400],
});
await check('task with blank title rejected', '/tasks', {
  method: 'POST', body: { title: '   ' }, expect: [400],
});
await check('invalid status value rejected', '/tasks', {
  method: 'POST', body: { title: 'ok', status: 'nope' }, expect: [400],
});
await check('valid task body passes validation', '/tasks', {
  method: 'POST', body: { title: 'Smoke test task', priority: 'high' }, expect: [201, 503],
});
await check('date-only due date accepted', '/tasks', {
  method: 'POST', body: { title: 'Smoke test task', dueDate: '2026-12-31' }, expect: [201, 503],
});
await check('nonsense due date rejected', '/tasks', {
  method: 'POST', body: { title: 'ok', dueDate: 'not-a-date' }, expect: [400],
});

// Params
await check('non-numeric task id rejected', '/tasks/abc', { expect: [400] });
await check('negative task id rejected', '/tasks/-3', { expect: [400] });

// Weather: city is optional, so this must reach the controller (503), not 400.
await check('weather without city falls back to profile', '/weather', { expect: [200, 502, 503] });
await check('weather with oversized city rejected', `/weather?city=${'x'.repeat(200)}`, { expect: [400] });
await check('weather with valid city passes validation', '/weather?city=Lisbon', { expect: [200, 502, 503] });

// Auth bodies
await check('registration rejects short password', '/auth/register', {
  method: 'POST',
  body: { email: 'a@b.com', password: 'short', displayName: 'A' },
  expect: [400],
});
await check('registration rejects duplicate-free invalid email', '/auth/register', {
  method: 'POST',
  body: { email: 'nope', password: 'longenough1', displayName: 'A' },
  expect: [400],
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);