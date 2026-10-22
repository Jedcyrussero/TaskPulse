import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { getStaticWeather } from './weather.static.js';

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
 * Build the OpenWeatherMap `q` value from a city and an optional country.
 *
 * OpenWeatherMap accepts `"City"`, `"City,CC"` (ISO-3166 alpha-2) or
 * `"City,State,CC"`. Users frequently type the country as a name ("Portugal")
 * or a full ISO code ("PRT"); both are rejected upstream, so we normalise to a
 * 2-letter code and fold it into the query string. When the city already carries
 * a comma (e.g. "Austin,TX" or "Paris,FR") we leave it untouched.
 */
function buildQuery(city, country) {
  const trimmed = String(city ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  if (trimmed.includes(',')) return trimmed;

  const cc = normaliseCountry(country);
  return cc ? `${trimmed},${cc}` : trimmed;
}

const COUNTRY_NAMES = {
  'united states': 'US', 'united states of america': 'US', usa: 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB',
  portugal: 'PT', spain: 'ES', france: 'FR', germany: 'DE', italy: 'IT',
  netherlands: 'NL', holland: 'NL', belgium: 'BE', switzerland: 'CH',
  austria: 'AT', ireland: 'IE', sweden: 'SE', norway: 'NO', denmark: 'DK',
  finland: 'FI', poland: 'PL', greece: 'GR', turkey: 'TR', russia: 'RU',
  canada: 'CA', mexico: 'MX', brazil: 'BR', argentina: 'AR', chile: 'CL',
  colombia: 'CO', peru: 'PE', china: 'CN', japan: 'JP', 'south korea': 'KR',
  korea: 'KR', india: 'IN', indonesia: 'ID', thailand: 'TH', vietnam: 'VN',
  philippines: 'PH', malaysia: 'MY', singapore: 'SG', australia: 'AU',
  'new zealand': 'NZ', egypt: 'EG', 'south africa': 'ZA', nigeria: 'NG',
  kenya: 'KE', morocco: 'MA', 'saudi arabia': 'SA', 'united arab emirates': 'AE',
  uae: 'AE', israel: 'IL', pakistan: 'PK', bangladesh: 'BD', ukraine: 'UA',
};

/** Coerce a user-supplied country into an ISO-3166 alpha-2 code, or null. */
function normaliseCountry(country) {
  let value = String(country ?? '').trim();
  if (!value) return null;

  // ISO alpha-3 -> alpha-2 for the most common ones users actually type.
  const ALPHA3 = {
    USA: 'US', GBR: 'GB', PRT: 'PT', ESP: 'ES', FRA: 'FR', DEU: 'DE',
    ITA: 'IT', NLD: 'NL', BEL: 'BE', CHE: 'CH', AUT: 'AT', IRL: 'IE',
    SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL', GRC: 'GR',
    TUR: 'TR', RUS: 'RU', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR',
    CHL: 'CL', COL: 'CO', PER: 'PE', CHN: 'CN', JPN: 'JP', KOR: 'KR',
    IND: 'IN', IDN: 'ID', THA: 'TH', VNM: 'VN', PHL: 'PH', MYS: 'MY',
    SGP: 'SG', AUS: 'AU', NZL: 'NZ', EGY: 'EG', ZAF: 'ZA', NGA: 'NG',
    KEN: 'KE', MAR: 'MA', SAU: 'SA', ARE: 'AE', ISR: 'IL', PAK: 'PK',
    BGD: 'BD', UKR: 'UA',
  };

  const upper = value.toUpperCase();
  if (ALPHA3[upper]) return ALPHA3[upper];
  if (/^[A-Za-z]{2}$/.test(value)) return upper;

  const named = COUNTRY_NAMES[value.toLowerCase()];
  return named ?? null;
}

/**
 * Resolve current conditions for a city.
 * Returns `{ available: false, reason }` when no API key is configured so the
 * dashboard degrades gracefully instead of erroring out.
 */
export async function getCurrentWeather(city, country) {
  const query = buildQuery(city, country);
  const normalized = query.toLowerCase();
  const unitSystem = env.weather.units === 'imperial' ? 'imperial' : 'metric';

  const cacheKey = `${normalized}:${unitSystem}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  // Which backend answers?
  //   static      -> always the built-in dataset
  //   openweather -> always OpenWeatherMap (errors if no key)
  //   auto/blank  -> OpenWeatherMap when a key exists, otherwise static
  const provider = resolveProvider();

  let result;
  if (provider === 'static') {
    result = decorate(getStaticWeather(city, country, { units: unitSystem }), city);
  } else {
    if (!env.weather.apiKey) {
      return {
        available: false,
        reason: 'WEATHER_API_KEY is not configured on the server.',
        location: city,
      };
    }
    result = decorate(await fetchOpenWeather(query, city, country), city);
  }

  cache.set(cacheKey, result);
  return result;
}

/** Decide which provider should serve this request. */
function resolveProvider() {
  const choice = env.weather.provider;
  if (choice === 'static' || choice === 'openweather' || choice === 'mock') return 'static';
  // "auto" or unset: use the live provider when configured, else fall back.
  return env.weather.apiKey ? 'openweather' : 'static';
}

/** Attach the human-readable condition/icon derived from the numeric code. */
function decorate(reading, city) {
  const [condition, icon] = describe(reading.code);
  return {
    ...reading,
    location: reading.location || city,
    condition,
    icon,
    description: reading.description ?? condition.toLowerCase(),
  };
}

/** Fetch and normalise a reading from OpenWeatherMap. */
async function fetchOpenWeather(query, city, country) {
  const url = new URL(`${env.weather.baseUrl}/weather`);
  url.searchParams.set('q', query);
  url.searchParams.set('appid', env.weather.apiKey);
  url.searchParams.set('units', env.weather.units);
  if (env.weather.lang) url.searchParams.set('lang', env.weather.lang);

  const data = await fetchJson(url);

  return {
    available: true,
    cached: false,
    source: 'openweather',
    location: data.name || city,
    country: data.sys?.country ?? normaliseCountry(country),
    code: data.weather?.[0]?.id ?? 800,
    description: data.weather?.[0]?.description ?? null,
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
}

export const __testing = { cache };