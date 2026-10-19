import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import * as authService from '../services/auth.service.js';
import {
  signAccessToken,
  verifyPassword,
  refreshCookieOptions,
  REFRESH_COOKIE,
} from '../utils/auth.js';

export const register = asyncHandler(async (req, res) => {
  const { email, password, displayName, city, country } = req.body;

  if (await authService.findUserByEmail(email)) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const user = await authService.createUser({ email, password, displayName, city, country });
  const { token } = await authService.issueRefreshToken(user.id);
  const accessToken = signAccessToken(user);

  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
  res.status(201).json({ user: toPublic(user), accessToken });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const record = await authService.findUserByEmail(email);
  // Always run a comparison so timing does not reveal whether the email exists.
  const hash = record?.password_hash || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await verifyPassword(password, hash);

  if (!record || !ok) throw ApiError.unauthorized('Incorrect email or password');

  const { token } = await authService.issueRefreshToken(record.id);
  const accessToken = signAccessToken({ ...record, display_name: record.display_name });

  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
  res.json({ user: toPublic(record), accessToken });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token');

  const { user, token: nextToken } = await authService.rotateRefreshToken(token);
  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
  });

  res.cookie(REFRESH_COOKIE, nextToken, refreshCookieOptions());
  res.json({ user: toPublic(user), accessToken });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await authService.revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.findUserById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user: toPublic(user) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateUser(req.user.id, req.body);
  res.json({ user: toPublic(user) });
});

function toPublic(user) {
  const { id, email, display_name, city, country, created_at, updated_at } = user;
  return {
    id,
    email,
    displayName: display_name,
    city,
    country,
    createdAt: created_at,
    updatedAt: updated_at,
  };
}