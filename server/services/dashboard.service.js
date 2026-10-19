import { pool } from '../db/pool.js';

/**
 * Aggregate everything the dashboard needs in a single round trip so the UI
 * can render with one request.
 */
export async function getDashboardStats(userId) {
  const [totals, byPriority, byStatus, upcoming, recentActivity] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int                                                      AS total,
         (COUNT(*) FILTER (WHERE status = 'done'))::int                    AS done,
         (COUNT(*) FILTER (WHERE status = 'in_progress'))::int             AS in_progress,
         (COUNT(*) FILTER (WHERE status = 'todo'))::int                    AS todo,
         (COUNT(*) FILTER (
           WHERE due_date < NOW() AND status <> 'done'
         ))::int                                                            AS overdue,
         (COUNT(*) FILTER (
           WHERE completed_at >= date_trunc('day', NOW())
         ))::int                                                            AS completed_today,
         (COUNT(*) FILTER (
           WHERE status <> 'done'
             AND due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         ))::int                                                            AS due_this_week
       FROM tasks WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT priority, COUNT(*)::int AS count
         FROM tasks WHERE user_id = $1 AND status <> 'done'
        GROUP BY priority`,
      [userId],
    ),
    pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS created,
              (COUNT(*) FILTER (WHERE status = 'done'))::int AS completed
         FROM tasks
        WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '13 days'
        GROUP BY 1 ORDER BY 1`,
      [userId],
    ),
    pool.query(
      `SELECT id, title, status, priority, due_date
         FROM tasks
        WHERE user_id = $1 AND status <> 'done' AND due_date IS NOT NULL
        ORDER BY due_date ASC LIMIT 5`,
      [userId],
    ),
    pool.query(
      `SELECT id, title, status, priority, completed_at
         FROM tasks
        WHERE user_id = $1 AND completed_at IS NOT NULL
        ORDER BY completed_at DESC LIMIT 5`,
      [userId],
    ),
  ]);

  const t = totals.rows[0];
  const completionRate = t.total ? Math.round((t.done / t.total) * 100) : 0;

  // Dense 14-day series (including empty days) for the activity chart.
  const byDay = new Map(byStatus.rows.map((r) => [String(r.day).slice(0, 10), r]));
  const trend = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(day);
    trend.push({ day, created: row?.created ?? 0, completed: row?.completed ?? 0 });
  }

  return {
    totals: {
      total: t.total,
      done: t.done,
      inProgress: t.in_progress,
      todo: t.todo,
      overdue: t.overdue,
      completedToday: t.completed_today,
      dueThisWeek: t.due_this_week,
      completionRate,
    },
    byPriority: { low: 0, medium: 0, high: 0, urgent: 0, ...Object.fromEntries(byPriority.rows.map((r) => [r.priority, r.count])) },
    trend,
    upcoming: upcoming.rows,
    recentActivity: recentActivity.rows,
  };
}