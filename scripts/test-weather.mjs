/**
 * Unit tests for the OpenWeatherMap integration. Runs entirely offline by
 * stubbing global fetch - no API key and no network needed.
 *
 *   node scripts/test-weather.mjs
 */
import assert from 'node:assert/strict';

// The service reads its key from config at import time, so set it first.
process.env.WEATHER_API_KEY = 'test-key';
process.env.WEATHER_UNITS = 'metric';
process.env.WEATHER_CACHE_TTL_MS = '60000';

const { getCurrentWeather } = await import('../server/services/weather.service.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

function samplePayload(overrides = {}) {
  return {
    name: 'Lisbon',
    sys: { country: 'PT', sunrise: 1767225600, sunset: 1767264000 },
    weather: [{ id: 801, description: 'few clouds' }],
    main: { temp: 18.4, feels_like: 17.9, temp_min: 16, temp_max: 21, humidity: 62 },
    wind: { speed: 3.6 },
    dt: 1767240000,
    ...overrides,
  };
}

/** Replace global.fetch with a stub that records calls. */
function stubFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok,
      status,
      json: async () => payload,
    };
  };
  return calls;
}

await test('maps a successful response to the client shape', async () => {
  stubFetch(samplePayload());
  const w = await getCurrentWeather('Lisbon');

  assert.equal(w.available, true);
  assert.equal(w.location, 'Lisbon');
  assert.equal(w.country, 'PT');
  assert.equal(w.condition, 'Few clouds');
  assert.equal(w.icon, 'cloud');
  assert.equal(w.temperature, 18);
  assert.equal(w.feelsLike, 18);
  assert.equal(w.humidity, 62);
  assert.equal(w.units, 'metric');
  assert.match(w.observedAt, /^\d{4}-\d{2}-\d{2}T/);
});

await test('sends the api key, units and query as query params', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Porto');

  const url = new URL(calls[0]);
  assert.equal(url.pathname, '/data/2.5/weather');
  assert.equal(url.searchParams.get('q'), 'Porto');
  assert.equal(url.searchParams.get('appid'), 'test-key');
  assert.equal(url.searchParams.get('units'), 'metric');
});

await test('caches per city and serves the second call from memory', async () => {
  const calls = stubFetch(samplePayload());
  const first = await getCurrentWeather('Madrid');
  const second = await getCurrentWeather('Madrid');

  assert.equal(calls.length, 1, 'upstream should be called only once');
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.temperature, first.temperature);
});

await test('a different city bypasses the cache', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Berlin');
  await getCurrentWeather('Munich');
  assert.equal(calls.length, 2);
});

await test('caches case-insensitively', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Oslo');
  await getCurrentWeather('OSLO');
  assert.equal(calls.length, 1);
});

await test('weather condition codes map to an icon', async () => {
  const cases = [
    [800, 'Clear sky', 'clear'],
    [500, 'Light rain', 'rain'],
    [601, 'Snow', 'snow'],
    [741, 'Fog', 'fog'],
    [200, 'Thunderstorm', 'storm'],
    [804, 'Overcast', 'cloud'],
  ];

  for (const [id, condition, icon] of cases) {
    stubFetch(samplePayload({ weather: [{ id, description: condition.toLowerCase() }] }));
    const w = await getCurrentWeather(`City-${id}`);
    assert.equal(w.condition, condition, `code ${id} label`);
    assert.equal(w.icon, icon, `code ${id} icon`);
  }
});

await test('an upstream error surfaces as a 502 ApiError', async () => {
  stubFetch({ message: 'Invalid API key' }, { ok: false, status: 401 });
  await assert.rejects(
    () => getCurrentWeather('Nowhere'),
    (err) => err.status === 502 && /Invalid API key/.test(err.message),
  );
});

await test('a hung upstream times out rather than hanging the request', async () => {
  globalThis.fetch = (url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  await assert.rejects(
    () => getCurrentWeather('Slowtown'),
    (err) => err.status === 502 && /timed out/i.test(err.message),
  );
});

await test('an unknown code falls back instead of throwing', async () => {
  stubFetch(samplePayload({ weather: [{ id: 9999, description: 'mystery' }] }));
  const w = await getCurrentWeather('Oddtown');
  assert.equal(w.condition, 'Unknown');
  assert.equal(w.icon, 'cloud');
});

await test('missing optional fields do not break mapping', async () => {
  stubFetch({ name: 'Bare', weather: [{ id: 800 }] });
  const w = await getCurrentWeather('Bare');
  assert.equal(w.temperature, 0);
  assert.equal(w.humidity, null);
  assert.equal(w.country, null);
});

await test('appends an ISO country code to the query', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Porto', 'PT');
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('q'), 'Porto,PT');
});

await test('normalises a country name to its ISO code', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Lisbon', 'Portugal');
  assert.equal(new URL(calls[0]).searchParams.get('q'), 'Lisbon,PT');
});

await test('normalises a full ISO alpha-3 code', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Washington', 'USA');
  assert.equal(new URL(calls[0]).searchParams.get('q'), 'Washington,US');
});

await test('leaves a query that already includes a country untouched', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Austin,TX', 'US');
  assert.equal(new URL(calls[0]).searchParams.get('q'), 'Austin,TX');
});

await test('falls back to a bare city when the country is unrecognised', async () => {
  const calls = stubFetch(samplePayload());
  await getCurrentWeather('Nowhereville', 'Atlantis');
  assert.equal(new URL(calls[0]).searchParams.get('q'), 'Nowhereville');
});

// --- Static provider --------------------------------------------------------

const { getStaticWeather } = await import('../server/services/weather.static.js');

await test('static provider returns the client shape', () => {
  const w = getStaticWeather('Manila', 'PH');
  assert.equal(w.available, true);
  assert.equal(w.source, 'static');
  assert.equal(w.location, 'Manila');
  assert.equal(w.country, 'PH');
  assert.equal(w.units, 'metric');
  assert.equal(typeof w.temperature, 'number');
  assert.equal(typeof w.humidity, 'number');
  assert.match(w.observedAt, /^\d{4}-\d{2}-\d{2}T/);
});

await test('static provider is deterministic for a given city', () => {
  const a = getStaticWeather('Cebu', 'PH');
  const b = getStaticWeather('Cebu', 'PH');
  assert.equal(a.temperature, b.temperature);
  assert.equal(a.humidity, b.humidity);
  assert.equal(a.code, b.code);
});

await test('static provider knows Philippine cities', () => {
  for (const city of ['Manila', 'Cebu', 'Davao', 'Baguio']) {
    const w = getStaticWeather(city, 'PH');
    assert.equal(w.country, 'PH', `${city} country`);
    assert.ok(w.temperature > 0, `${city} has a temperature`);
  }
});

await test('static provider honours imperial units', () => {
  const metric = getStaticWeather('Manila', 'PH', { units: 'metric' });
  const imperial = getStaticWeather('Manila', 'PH', { units: 'imperial' });
  assert.equal(imperial.units, 'imperial');
  assert.ok(imperial.temperature > metric.temperature, 'F is numerically higher than C');
});

await test('static provider parses a City,CC query', () => {
  const w = getStaticWeather('Lisbon,PT');
  assert.equal(w.location, 'Lisbon');
  assert.equal(w.country, 'PT');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);