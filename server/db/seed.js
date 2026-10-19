/**
 * Seeds a demo account with a spread of tasks so the dashboard has something
 * to show. Safe to re-run: it clears the demo user's tasks first.
 *
 *   npm run db:seed
 */
import { pool, closePool } from './pool.js';
import { hashPassword } from '../utils/auth.js';

const DEMO_EMAIL = 'demo@taskpulse.app';
const DEMO_PASSWORD = 'demo1234';

const TASKS = [
  { title: 'Review Q3 product roadmap', priority: 'urgent', status: 'in_progress', dueInDays: 1 },
  { title: 'Fix dashboard chart on mobile Safari', priority: 'high', status: 'todo', dueInDays: 2 },
  { title: 'Write API integration tests', priority: 'medium', status: 'todo', dueInDays: 4 },
  { title: 'Update onboarding copy', priority: 'low', status: 'todo', dueInDays: 6 },
  { title: 'Weekly team sync notes', priority: 'medium', status: 'done', completedDaysAgo: 1 },
  { title: 'Upgrade Postgres to 16', priority: 'high', status: 'done', completedDaysAgo: 2 },
  { title: 'Design empty states for task list', priority: 'low', status: 'todo', dueInDays: 9 },
  { title: 'Profile the weather widget cache', priority: 'urgent', status: 'todo', dueInDays: -2 }, // overdue
  { title: 'Archive sprint 41 board', priority: 'low', status: 'done', completedDaysAgo: 4 },
  { title: 'Reply to customer feedback thread', priority: 'medium', status: 'done', completedDaysAgo: 5 },
  { title: 'Set up staging database snapshot', priority: 'high', status: 'done', completedDaysAgo: 6 },
  { title: 'Audit npm dependencies', priority: 'low', status: 'done', completedDaysAgo: 7 },
];

function offsetDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

try {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, city, country)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           city = EXCLUDED.city,
           country = EXCLUDED.country
     RETURNING id`,
    [DEMO_EMAIL, passwordHash, 'Demo User', 'Lisbon', 'PT'],
  );
  const userId = rows[0].id;

  await pool.query('DELETE FROM tasks WHERE user_id = $1', [userId]);

  for (const t of TASKS) {
    const due = t.dueInDays !== undefined ? offsetDate(t.dueInDays) : null;
    const completedAt = t.completedDaysAgo !== undefined ? offsetDate(-t.completedDaysAgo) : null;

    await pool.query(
      `INSERT INTO tasks (user_id, title, status, priority, due_date, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        t.title,
        t.status,
        t.priority,
        due,
        t.status === 'done' ? completedAt : null,
        offsetDate(-Math.floor(Math.random() * 12) - 1),
      ],
    );
  }

  console.log(`[seed] demo user ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`[seed] inserted ${TASKS.length} tasks.`);
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}