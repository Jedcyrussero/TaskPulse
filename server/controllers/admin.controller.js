import asyncHandler from '../utils/asyncHandler.js';
import * as adminService from '../services/admin.service.js';

export const stats = asyncHandler(async (_req, res) => {
  res.json(await adminService.getStats());
});

export const listUsers = asyncHandler(async (req, res) => {
  res.json(await adminService.listUsers(req.query));
});

export const getUser = asyncHandler(async (req, res) => {
  res.json({ user: await adminService.getUser(req.params.id) });
});

export const updateRole = asyncHandler(async (req, res) => {
  const user = await adminService.setRole(req.params.id, req.body.role, req.user.id);
  res.json({ user });
});

export const removeUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.params.id, req.user.id);
  res.status(204).end();
});
