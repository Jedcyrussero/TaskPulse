import asyncHandler from '../utils/asyncHandler.js';
import { getDashboardStats } from '../services/dashboard.service.js';

export const summary = asyncHandler(async (req, res) => {
  const stats = await getDashboardStats(req.user.id);
  res.json(stats);
});