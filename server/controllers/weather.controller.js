import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import * as authService from '../services/auth.service.js';
import { getCurrentWeather } from '../services/weather.service.js';

/**
 * Weather for an explicit city, or for the signed-in user's saved city when
 * `?city` is omitted.
 */
export const current = asyncHandler(async (req, res) => {
  let city = req.query.city;

  if (!city) {
    const user = await authService.findUserById(req.user.id);
    city = user?.city;
    if (!city) {
      throw ApiError.badRequest('No city on your profile. Add one or pass ?city=YourCity');
    }
  }

  const weather = await getCurrentWeather(city);
  res.json(weather);
});