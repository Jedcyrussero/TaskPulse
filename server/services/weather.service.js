import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/** Small TTL cache - enough for per-user weather lookups without Redis. */
class TtlCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key, value) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    // Cheap bound so a long-running process cannot grow unbounded.
    if (this.store.size > 500) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
  }

  clear() {
    this.store.clear();
  }
}

const cache = new TtlCache(env.weather.cacheTtlMs);

const WEATHER_CODES = {
  200: ['Thunderstorm', 'storm'],
  201: ['Thunderstorm', 'storm'],
  202: ['Thunderstorm', 'storm'],
  210: ['Thunderstorm', 'storm'],
  230: ['Thunderstorm', 'storm'],
  300: ['Drizzle', 'rain'],
  301: ['Drizzle', 'rain'],
  302: ['Drizzle', 'rain'],
  310: ['Freezing drizzle', 'rain'],
  311: ['Freezing drizzle', 'rain'],
  312: ['Freezing drizzle', 'rain'],
  321: ['Freezing drizzle', 'rain'],
  500: ['Light rain', 'rain'],
  501: ['Rain', 'rain'],
  502: ['Heavy rain', 'rain'],
  503: ['Heavy shower rain', 'rain'],
  504: ['Heavy shower rain', 'rain'],
  520: ['Light shower rain', 'rain'],
  521: ['Shower rain', 'rain'],
  522: ['Heavy shower rain', 'rain'],
  531: ['Drizzle', 'rain'],
  600: ['Light snow', 'snow'],
  601: ['Snow', 'snow'],
  602: ['Heavy snow', 'snow'],
  611: ['Sleet', 'snow'],
  612: ['Sleet', 'snow'],
  615: ['Rain and snow', 'snow'],
  616: ['Rain and snow', 'snow'],
  620: ['Light rain and snow', 'snow'],
  621: ['Rain and snow', 'snow'],
  622: ['Heavy rain and snow', 'snow'],
  701: ['Mist', 'fog'],
  711: ['Smoke', 'fog'],
  721: ['Haze', 'fog'],
  731: ['Dust', 'fog'],
  741: ['Fog', 'fog'],
  751: ['Sand', 'fog'],
  761: ['Dust', 'fog'],
  762: ['Ash', 'fog'],
  771: ['Squalls', 'wind'],
  781: ['Tornado', 'storm'],
  800: ['Clear sky', 'clear'],
  801: ['Few clouds', 'cloud'],
  802: ['Scattered clouds', 'cloud'],
  803: ['Broken clouds', 'cloud'],
  804: ['Overcast', 'cloud'],
};

function describe(code) {
  return WEATHER_CODES[code] || ['Unknown', 'cloud'];
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.weather.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // Surface upstream errors as our own so the client can distinguish them.
      const message = body?.message || `Weather provider responded ${res.status}`;
      throw ApiError.upstream(message);
    }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') throw ApiError.upstream('Weather provider timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve current conditions for a city.
 * Returns `{ available: false, reason }` when no API key is configured so the
 * dashboard degrades gracefully instead of erroring out.
 */
export async function getCurrentWeather(city) {
  const normalized = city.trim().toLowerCase();

  if (!env.weather.apiKey) {
    return {
      available: false,
      reason: 'WEATHER_API_KEY is not configured on the server.',
      location: city,
    };
  }

  const cacheKey = `${normalized}:${env.weather.units}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const url = new URL(`${env.weather.baseUrl}/weather`);
  url.searchParams.set('q', city);
  url.searchParams.set('appid', env.weather.apiKey);
  url.searchParams.set('units', env.weather.units);
  if (env.weather.lang) url.searchParams.set('lang', env.weather.lang);

  const data = await fetchJson(url);

  const [condition, icon] = describe(data.weather?.[0]?.id);
  const result = {
    available: true,
    cached: false,
    location: data.name || city,
    country: data.sys?.country ?? null,
    condition,
    icon,
    description: data.weather?.[0]?.description ?? condition,
    temperature: Math.round(data.main?.temp ?? 0),
    feelsLike: Math.round(data.main?.feels_like ?? 0),
    minTemp: Math.round(data.main?.temp_min ?? 0),
    maxTemp: Math.round(data.main?.temp_max ?? 0),
    humidity: data.main?.humidity ?? null,
    windSpeed: data.wind?.speed ?? null,
    units: env.weather.units === 'imperial' ? 'imperial' : 'metric',
    observedAt: new Date((data.dt ?? Date.now() / 1000) * 1000).toISOString(),
    sunrise: data.sys?.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : null,
    sunset: data.sys?.sunset ? new Date(data.sys.sunset * 1000).toISOString() : null,
  };

  cache.set(cacheKey, result);
  return result;
}

export const __testing = { cache };