import asyncHandler from '../utils/asyncHandler.js';
import * as taskService from '../services/task.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await taskService.listTasks(req.user.id, req.query);
  res.json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  const task = await taskService.getTask(req.user.id, req.params.id);
  res.json({ task });
});

export const create = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.user.id, req.body);
  res.status(201).json({ task });
});

export const update = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(req.user.id, req.params.id, req.body);
  res.json({ task });
});

export const toggle = asyncHandler(async (req, res) => {
  const task = await taskService.toggleTask(req.user.id, req.params.id);
  res.json({ task });
});

export const remove = asyncHandler(async (req, res) => {
  await taskService.deleteTask(req.user.id, req.params.id);
  res.status(204).end();
});