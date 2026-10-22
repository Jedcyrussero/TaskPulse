import { pool } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';

const PUBLIC_COLUMNS = 'id, email, display_name, city, country, role, created_at, updated_at';

/**
 * Platform-wide counters for the admin overview. Runs the aggregate queries in
 * parallel since none depend on each other.
 */
export async function getStats() {
  const [users, tasks, statuses, signups] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_this_week
        FROM users`),
    pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'done')::int AS done,
             COUNT(*) FILTER (WHERE status <> 'done' AND due_date < NOW())::int AS overdue
        FROM tasks`),
    pool.query(`
      SELECT status, COUNT(*)::int AS count
        FROM tasks GROUP BY status`),
    pool.query(`
      SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*)::int AS count
        FROM users
       WHERE created_at >= NOW() - INTERVAL '14 days'
       GROUP BY 1 ORDER BY 1`),
  ]);

  const byStatus = { todo: 0, in_progress: 0, done: 0 };
  for (const row of statuses.rows) byStatus[row.status] = row.count;

  const taskTotals = tasks.rows[0];
  return {
    users: users.rows[0],
    tasks: {
      ...taskTotals,
      completionRate: taskTotals.total
        ? Math.round((taskTotals.done / taskTotals.total) * 100)
        : 0,
      byStatus,
    },
    signups: signups.rows.map((r) => ({ day: r.day, count: r.count })),
  };
}

/**
 * Paginated user list with per-user task counts.
 * `search` matches email or display name; `role` filters exactly.
 */
export async function listUsers({ search, role, sort = 'created_at', order = 'desc', page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortable = {
    created_at: 'u.created_at',
    updated_at: 'u.updated_at',
    email: 'u.email',
    display_name: 'u.display_name',
    task_count: 'task_count',
  };
  const sortCol = sortable[sort] || sortable.created_at;
  const dir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (safePage - 1) * safeSize;

  const [items, count] = await Promise.all([
    pool.query(
      `SELECT u.id, u.email, u.display_name, u.city, u.country, u.role,
              u.created_at, u.updated_at,
              COUNT(t.id)::int AS task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_count
         FROM users u
         LEFT JOIN tasks t ON t.user_id = u.id
         ${whereSql}
        GROUP BY u.id
        ORDER BY ${sortCol} ${dir} NULLS LAST, u.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safeSize, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM users u ${whereSql}`, params),
  ]);

  const total = count.rows[0].count;
  return {
    items: items.rows,
    pagination: {
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeSize)),
    },
  };
}

export async function getUser(id) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS.replace(/\s+/g, ' ')} FROM users WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw ApiError.notFound('User not found');

  const { rows: taskRows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'done')::int AS done
       FROM tasks WHERE user_id = $1`,
    [id],
  );
  return { ...rows[0], tasks: taskRows[0] };
}

/** Change a user's role. Refuses to remove the last remaining admin. */
export async function setRole(id, role, actingUserId) {
  if (role === 'user') {
    // Guard against locking everyone out of the admin area.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS admins FROM users WHERE role = 'admin' AND id <> $1`,
      [id],
    );
    if (rows[0].admins === 0) {
      throw ApiError.badRequest('Cannot demote the last remaining admin');
    }
  }

  const { rows } = await pool.query(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, role],
  );
  if (!rows[0]) throw ApiError.notFound('User not found');

  // Changing your own role invalidates the assumption the current session made.
  if (Number(id) === Number(actingUserId)) {
    rows[0].self = true;
  }
  return rows[0];
}

/** Delete a user (tasks + refresh tokens cascade). Refuses self-deletion. */
export async function deleteUser(id, actingUserId) {
  if (Number(id) === Number(actingUserId)) {
    throw ApiError.badRequest('You cannot delete your own account from here');
  }
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (!rowCount) throw ApiError.notFound('User not found');
}
