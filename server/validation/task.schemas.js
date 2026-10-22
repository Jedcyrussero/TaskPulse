import { z } from 'zod';

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const statusEnum = z.enum(STATUSES);
export const priorityEnum = z.enum(PRIORITIES);

/** Accepts ISO-8601 or a plain YYYY-MM-DD date. */
const dateInput = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid date format' })
  .transform((v) => (v.length === 10 ? `${v}T12:00:00.000Z` : new Date(v).toISOString()));

export const listTasksSchema = z.object({
  // Repeated query params (?status=todo&status=done) arrive as arrays; a single
  // value arrives as a string. Normalise both to an array.
  status: z
    .union([z.enum(STATUSES), z.array(z.enum(STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  priority: z
    .union([z.enum(PRIORITIES), z.array(z.enum(PRIORITIES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  search: z.string().trim().max(200).optional(),
  due: z.enum(['overdue', 'today', 'week', 'none']).optional(),
  sort: z.enum(['created_at', 'updated_at', 'due_date', 'title', 'priority']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  description: z.string().trim().max(2000).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  dueDate: dateInput.nullish(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueDate: dateInput.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const taskIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid task id'),
});

export const weatherQuerySchema = z.object({
  // Optional: when omitted the controller falls back to the user's profile city.
  city: z.string().trim().min(1).max(120).optional(),
  // Optional ISO code or country name used to disambiguate the city.
  country: z.string().trim().min(1).max(60).optional(),
});