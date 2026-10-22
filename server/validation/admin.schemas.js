import { z } from 'zod';

export const ROLES = ['user', 'admin'];

export const listUsersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(ROLES).optional(),
  sort: z.enum(['created_at', 'updated_at', 'email', 'display_name', 'task_count']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const userIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid user id'),
});

export const updateRoleSchema = z.object({
  role: z.enum(ROLES, { message: "role must be 'user' or 'admin'" }),
});
