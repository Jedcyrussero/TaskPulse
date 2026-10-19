import { pool } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';

const SORTABLE = {
  created_at: 't.created_at',
  updated_at: 't.updated_at',
  due_date: 't.due_date',
  title: 't.title',
  priority: `CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`,
};

const SELECT_TASK = `
  SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority,
         t.due_date, t.completed_at, t.created_at, t.updated_at
    FROM tasks t
`;

export async function listTasks(userId, filters = {}) {
  const {
    status, priority, search, due, sort = 'created_at', order = 'desc',
    page = 1, pageSize = 20,
  } = filters;

  const where = ['t.user_id = $1'];
  const params = [userId];

  if (status?.length) {
    params.push(status);
    where.push(`t.status = ANY($${params.length}::text[])`);
  }
  if (priority?.length) {
    params.push(priority);
    where.push(`t.priority = ANY($${params.length}::text[])`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }
  if (due === 'overdue') {
    where.push(`t.due_date < NOW() AND t.status <> 'done'`);
  } else if (due === 'today') {
    where.push(`t.due_date::date = CURRENT_DATE AND t.status <> 'done'`);
  } else if (due === 'week') {
    where.push(`t.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND t.status <> 'done'`);
  } else if (due === 'none') {
    where.push('t.due_date IS NULL');
  }

  const whereSql = where.join(' AND ');
  const sortCol = SORTABLE[sort] || SORTABLE.created_at;
  const dir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (safePage - 1) * safeSize;

  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `${SELECT_TASK} WHERE ${whereSql} ORDER BY ${sortCol} ${dir} NULLS LAST, t.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safeSize, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM tasks t WHERE ${whereSql}`, params),
  ]);

  const items = itemsResult.rows;
  const { count } = countResult.rows[0];

  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safeSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / safeSize)),
    },
  };
}

export async function getTask(userId, id) {
  const { rows } = await pool.query(`${SELECT_TASK} WHERE t.user_id = $1 AND t.id = $2`, [
    userId,
    id,
  ]);
  if (!rows[0]) throw ApiError.notFound('Task not found');
  return rows[0];
}

export async function createTask(userId, { title, description, status, priority, dueDate }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, title, description, status, priority, due_date, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             CASE WHEN $4 = 'done' THEN NOW() ELSE NULL END)
     RETURNING id, user_id, title, description, status, priority, due_date,
               completed_at, created_at, updated_at`,
    [userId, title, description ?? null, status ?? 'todo', priority ?? 'medium', dueDate ?? null],
  );
  return rows[0];
}

export async function updateTask(userId, id, patch) {
  const sets = [];
  const params = [userId, id];

  const push = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if (patch.title !== undefined) push('title', patch.title);
  if (patch.description !== undefined) push('description', patch.description);
  if (patch.priority !== undefined) push('priority', patch.priority);
  if (patch.dueDate !== undefined) push('due_date', patch.dueDate);

  if (patch.status !== undefined) {
    push('status', patch.status);
    // Keep completed_at consistent with status transitions.
    sets.push(
      patch.status === 'done'
        ? 'completed_at = COALESCE(completed_at, NOW())'
        : 'completed_at = NULL',
    );
  }

  if (!sets.length) return getTask(userId, id);

  const { rows } = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')}
      WHERE user_id = $1 AND id = $2
      RETURNING id, user_id, title, description, status, priority, due_date,
                completed_at, created_at, updated_at`,
    params,
  );
  if (!rows[0]) throw ApiError.notFound('Task not found');
  return rows[0];
}

export async function deleteTask(userId, id) {
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE user_id = $1 AND id = $2', [
    userId,
    id,
  ]);
  if (!rowCount) throw ApiError.notFound('Task not found');
}

export async function toggleTask(userId, id) {
  const task = await getTask(userId, id);
  const next = task.status === 'done' ? 'todo' : 'done';
  return updateTask(userId, id, { status: next });
}