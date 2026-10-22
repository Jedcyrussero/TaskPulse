import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import validate from '../middleware/validate.js';
import requireAuth, { requireAdmin } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import * as taskController from '../controllers/task.controller.js';
import * as dashboardController from '../controllers/dashboard.controller.js';
import * as weatherController from '../controllers/weather.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
} from '../validation/auth.schemas.js';
import {
  listTasksSchema,
  createTaskSchema,
  updateTaskSchema,
  taskIdSchema,
  weatherQuerySchema,
} from '../validation/task.schemas.js';
import {
  listUsersSchema,
  userIdSchema,
  updateRoleSchema,
} from '../validation/admin.schemas.js';
import { query } from '../db/pool.js';

const router = Router();

/** Throttle credential endpoints to blunt password guessing. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Try again in a few minutes.' } },
});

// --- Health -----------------------------------------------------------------
router.get('/health', asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
}));

// --- Auth -------------------------------------------------------------------
router.post('/auth/register', authLimiter, validate(registerSchema), authController.register);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);

router.get('/auth/me', requireAuth, authController.me);
router.patch('/auth/me', requireAuth, validate(updateProfileSchema), authController.updateProfile);

// --- Tasks ------------------------------------------------------------------
router.get('/tasks', requireAuth, validate(listTasksSchema, 'query'), taskController.list);
router.post('/tasks', requireAuth, validate(createTaskSchema), taskController.create);

router.get('/tasks/:id', requireAuth, validate(taskIdSchema, 'params'), taskController.getOne);
router.patch('/tasks/:id', requireAuth, validate(taskIdSchema, 'params'), validate(updateTaskSchema), taskController.update);
router.delete('/tasks/:id', requireAuth, validate(taskIdSchema, 'params'), taskController.remove);
router.post('/tasks/:id/toggle', requireAuth, validate(taskIdSchema, 'params'), taskController.toggle);

// --- Dashboard --------------------------------------------------------------
router.get('/dashboard/summary', requireAuth, dashboardController.summary);

// --- Weather (OpenWeatherMap or built-in static provider) -------------------
router.get('/weather', requireAuth, validate(weatherQuerySchema, 'query'), weatherController.current);

// --- Admin (requires role='admin'; regular users get 403) -------------------
router.get('/admin/stats', requireAuth, requireAdmin, adminController.stats);
router.get('/admin/users', requireAuth, requireAdmin, validate(listUsersSchema, 'query'), adminController.listUsers);
router.get('/admin/users/:id', requireAuth, requireAdmin, validate(userIdSchema, 'params'), adminController.getUser);
router.patch('/admin/users/:id/role', requireAuth, requireAdmin, validate(userIdSchema, 'params'), validate(updateRoleSchema), adminController.updateRole);
router.delete('/admin/users/:id', requireAuth, requireAdmin, validate(userIdSchema, 'params'), adminController.removeUser);

export default router;