/**
 * Static weather provider - no API key, no network.
 *
 * Produces the exact same response shape as the OpenWeatherMap provider so the
 * controller, frontend and tests never need to know which backend answered.
 *
 * Conditions are deterministic per city: the same city always yields the same
 * "current" reading (stable across reloads), but the reading is nudged by the
 * current hour and day so the widget does not look frozen.
 *
 * Enable with WEATHER_PROVIDER=static (or automatically when no API key is set
 * and WEATHER_PROVIDER is left on "auto").
 */

/** Built-in reference climate for well-known cities. Temperatures in Celsius. */
const CITIES = {
  // Philippines
  manila: { country: 'PH', temp: 31, humidity: 74, wind: 4.1, code: 801 },
  'quezon city': { country: 'PH', temp: 30, humidity: 76, wind: 3.6, code: 802 },
  cebu: { country: 'PH', temp: 30, humidity: 78, wind: 4.6, code: 801 },
  davao: { country: 'PH', temp: 29, humidity: 80, wind: 3.2, code: 500 },
  baguio: { country: 'PH', temp: 21, humidity: 82, wind: 2.4, code: 804 },
  'cebu city': { country: 'PH', temp: 30, humidity: 78, wind: 4.6, code: 801 },
  iloilo: { country: 'PH', temp: 30, humidity: 79, wind: 3.9, code: 802 },
  'makati': { country: 'PH', temp: 31, humidity: 73, wind: 3.4, code: 801 },

  // Common reference points elsewhere
  lisbon: { country: 'PT', temp: 18, humidity: 62, wind: 3.6, code: 801 },
  porto: { country: 'PT', temp: 16, humidity: 70, wind: 3.1, code: 802 },
  madrid: { country: 'ES', temp: 22, humidity: 45, wind: 2.8, code: 800 },
  london: { country: 'GB', temp: 12, humidity: 78, wind: 5.2, code: 804 },
  paris: { country: 'FR', temp: 15, humidity: 68, wind: 3.4, code: 803 },
  berlin: { country: 'DE', temp: 11, humidity: 72, wind: 4.0, code: 804 },
  'new york': { country: 'US', temp: 17, humidity: 60, wind: 4.3, code: 802 },
  tokyo: { country: 'JP', temp: 19, humidity: 64, wind: 3.0, code: 800 },
  singapore: { country: 'SG', temp: 30, humidity: 84, wind: 2.9, code: 500 },
  dubai: { country: 'AE', temp: 34, humidity: 40, wind: 3.5, code: 800 },
  sydney: { country: 'AU', temp: 21, humidity: 58, wind: 4.8, code: 801 },
};

/** OpenWeatherMap condition codes the service knows how to describe. */
const CODES = [800, 801, 802, 803, 804, 500, 501, 600, 701, 741, 200];

/** Stable 32-bit hash so a city always maps to the same variation. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Convert a metric reading into the configured unit system. */
function convert(celsius, units) {
  return units === 'imperial' ? Math.round(celsius * 9 / 5 + 32) : Math.round(celsius);
}

/**
 * Resolve a synthetic-but-plausible reading for a city.
 * `city` may arrive as "Manila", "Manila,PH" or "Austin,TX".
 */
export function getStaticWeather(city, country, { units = 'metric' } = {}) {
  const raw = String(city ?? '').trim();

  // Split "City,Region,CC" -> the last segment may be a country/region code.
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || raw || 'Unknown';
  const suffix = parts[1] || '';

  const key = name.toLowerCase();
  const preset = CITIES[key];

  const seed = hash(`${key}|${suffix.toLowerCase()}`);
  const now = new Date();
  // A gentle day/season drift so repeated visits differ slightly.
  const drift = ((now.getMonth() * 31 + now.getDate()) % 9) - 4;

  const baseTemp = preset ? preset.temp : 12 + (seed % 18); // 12..29 °C otherwise
  const tempC = baseTemp + drift * 0.4 + ((seed >> 3) % 5) * 0.2;
  const humidity = preset ? preset.humidity : 45 + (seed % 45);
  const windKmh = preset ? preset.wind : 1.5 + (seed % 60) / 10; // m/s
  const code = preset ? preset.code : CODES[seed % CODES.length];

  const sunrise = new Date(now);
  sunrise.setHours(6, 12, 0, 0);
  const sunset = new Date(now);
  sunset.setHours(18, 24, 0, 0);

  return {
    available: true,
    cached: false,
    source: 'static',
    location: name,
    country: preset?.country ?? (suffix.length === 2 ? suffix.toUpperCase() : null),
    code,
    temperature: convert(tempC, units),
    feelsLike: convert(tempC + ((seed >> 5) % 3) - 1, units),
    minTemp: convert(tempC - 3, units),
    maxTemp: convert(tempC + 3, units),
    humidity,
    windSpeed: Math.round(windKmh * 10) / 10,
    units: units === 'imperial' ? 'imperial' : 'metric',
    observedAt: now.toISOString(),
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
  };
}

export const __testing = { CITIES };
