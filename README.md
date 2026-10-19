# TaskPulse

A task manager with a weather-aware dashboard. Classic 3-tier web architecture:

| Tier        | Stack                                    |
| ----------- | ---------------------------------------- |
| Frontend    | HTML5, CSS3, Vanilla JS (Fetch API)      |
| Backend     | Node.js + Express REST API               |
| Database    | PostgreSQL                               |
| Integration | OpenWeatherMap (dashboard weather widget) |

No build step, no framework, no bundler. The frontend is ES modules the browser
loads directly.

---

## Quick start

```bash
git clone <this-repo> taskpulse
cd taskpulse

cp .env.example .env      # then edit it (see Configuration)
docker compose up -d      # starts Postgres + the API
npm run db:seed           # optional: demo user with sample tasks
```

Open <http://localhost:3000> and sign in with:

```
demo@taskpulse.app
demo1234
```

### Running without Docker

```bash
npm install
createdb taskpulse                        # or: CREATE DATABASE taskpulse;
npm run db:migrate                        # apply server/db/schema.sql
npm run db:seed                           # optional demo data
npm run dev                               # http://localhost:3000
```

---

## Configuration

Everything lives in `.env` (copy from `.env.example`). Only `DATABASE_URL` and
the JWT secrets are required.

| Variable                   | Default                     | Notes                                                    |
| -------------------------- | --------------------------- | -------------------------------------------------------- |
| `PORT`                     | `3000`                      | API + static frontend on the same port                    |
| `DATABASE_URL`             | —                           | Required. Compose overrides the host to `db`.             |
| `PGSSL`                    | `false`                     | Set `true` for managed databases (Neon, RDS, Supabase)    |
| `JWT_ACCESS_SECRET`        | —                           | Required. Rejected at boot in production if left as `change_me`. |
| `JWT_REFRESH_SECRET`       | —                           | Required.                                                 |
| `JWT_ACCESS_TTL`           | `15m`                       | Access token lifetime                                     |
| `JWT_REFRESH_TTL_DAYS`     | `7`                         | Refresh token lifetime                                    |
| `WEATHER_API_KEY`          | *(empty)*                   | Optional. Dashboard degrades gracefully without it.       |
| `WEATHER_UNITS`            | `metric`                    | `imperial` for °F                                         |
| `WEATHER_CACHE_TTL_MS`     | `600000`                    | 10 minutes                                               |
| `WEATHER_TIMEOUT_MS`       | `8000`                      | Upstream request timeout                                  |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### OpenWeatherMap

Grab a free key from <https://home.openweathermap.org/api_keys> (the free
"Current Weather" plan is enough), put it in `.env`, and restart.

The weather widget falls back to an explicit "unavailable" state when no key is
configured, so the rest of the app works unchanged. New keys can take ~10
minutes to activate.

---

## Project layout

```
taskpulse/
├── docker-compose.yml        # Postgres + API
├── server/
│   ├── index.js              # entry point, graceful shutdown
│   ├── app.js                # express app assembly (middleware, static)
│   ├── config/env.js         # env parsing + secret validation
│   ├── db/
│   │   ├── pool.js           # pg Pool + type parsers
│   │   ├── schema.sql        # single source of truth for the schema
│   │   ├── migrate.js        # applies schema.sql (idempotent)
│   │   └── seed.js           # demo user + sample tasks
│   ├── middleware/           # auth guard, zod validation, error handler
│   ├── validation/           # zod schemas
│   ├── services/             # business logic (auth, task, dashboard, weather)
│   ├── controllers/          # HTTP request/response shaping
│   └── routes/index.js       # route table
├── public/
│   ├── index.html            # dashboard
│   ├── tasks.html            # task list + create/edit modal
│   ├── login.html / register.html
│   ├── css/styles.css        # design system (custom properties, no framework)
│   └── js/
│       ├── api.js            # fetch wrapper + automatic token refresh
│       ├── auth.js           # session guard + header
│       ├── auth-forms.js     # login / register
│       ├── dashboard.js      # stats, chart, weather
│       ├── tasks.js          # filters, sorting, pagination, modal
│       ├── task-item.js      # shared task row rendering
│       └── ui.js             # DOM helpers, toasts, formatting
└── scripts/
    ├── check-dom.mjs         # verifies JS selectors match the HTML
    ├── test-weather.mjs      # offline unit tests for the weather service
    └── smoke.mjs             # request-pipeline tests against a running server
```

Layering is strict: routes → middleware → controllers → services → db. Services
never touch `req`/`res`; controllers never build SQL.

---

## API

Base URL `/api`. Authenticated routes expect `Authorization: Bearer <token>`.

### Auth

| Method   | Path            | Auth | Description                             |
| -------- | --------------- | ---- | --------------------------------------- |
| `POST`   | `/auth/register`| —    | Create account, returns token + cookie  |
| `POST`   | `/auth/login`   | —    | Sign in                                 |
| `POST`   | `/auth/refresh` | cookie | Rotate refresh token, new access token |
| `POST`   | `/auth/logout`  | cookie | Revoke the current refresh token        |
| `GET`    | `/auth/me`      | ✓    | Current user                            |
| `PATCH`  | `/auth/me`      | ✓    | Update name / city / country            |

Register and login are rate limited to 20 attempts per 15 minutes.

### Tasks

| Method   | Path              | Description                                  |
| -------- | ----------------- | -------------------------------------------- |
| `GET`    | `/tasks`          | List with filters, sorting and pagination    |
| `POST`   | `/tasks`          | Create                                       |
| `GET`    | `/tasks/:id`      | Fetch one                                    |
| `PATCH`  | `/tasks/:id`      | Partial update                               |
| `DELETE` | `/tasks/:id`      | Delete                                       |
| `POST`   | `/tasks/:id/toggle` | Flip between `todo` and `done`             |

Query parameters for `GET /tasks`:

```
?status=todo&status=done   repeatable, OR-ed together
?priority=urgent
?search=roadmap            matches title or description, case-insensitive
?due=overdue|today|week|none
?sort=created_at|updated_at|due_date|title|priority
?order=asc|desc
?page=1&pageSize=20        pageSize capped at 100
```

Response shape:

```json
{
  "items": [ { "id": 1, "title": "...", "status": "todo", "priority": "high",
               "due_date": "2026-01-01T12:00:00.000Z", "completed_at": null,
               "created_at": "...", "updated_at": "..." } ],
  "pagination": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```

### Dashboard

`GET /dashboard/summary` — totals, completion rate, open tasks by priority, a
dense 14-day created/completed series, the 5 nearest deadlines and the 5 most
recent completions. One request, one round trip.

### Weather

`GET /weather?city=Lisbon` — proxied OpenWeatherMap call. When `city` is omitted
the user's profile city is used.

Responses are cached in memory per city for `WEATHER_CACHE_TTL_MS`. The
response includes `cached: true` on a cache hit. Without an API key the
endpoint returns `{ "available": false, "reason": "..." }` with HTTP 200, so
the UI degrades rather than erroring.

### Errors

Every failure returns the same envelope:

```json
{ "error": { "message": "Validation failed",
             "details": [ { "field": "email", "message": "Enter a valid email address" } ] } }
```

Validation failures are `400`, auth `401`, missing records `404`, conflicts
`409`, rate limits `429`, upstream weather failures `502`, database outages
`503`. Stack traces are included only outside production.

---

## Security notes

- Passwords hashed with bcrypt (cost 12).
- Login runs a bcrypt comparison even for unknown emails, so response timing
  does not reveal whether an account exists.
- Short-lived access tokens (15 min) are held in memory/localStorage; refresh
  tokens are opaque, single-use, rotated on every refresh, stored only as a
  SHA-256 hash, and delivered in an `httpOnly`, `SameSite` cookie scoped to
  `/api/auth`.
- Replaying a consumed refresh token is rejected.
- Every query is parameterised; sort columns come from a whitelist, never from
  raw input.
- Helmet sets a CSP, and `x-powered-by` is disabled.

---

## Development

```bash
npm run dev        # auto-restart on file changes
npm run check      # verify JS DOM selectors against the HTML
npm test           # weather service unit tests (no network needed)
npm run smoke      # request-pipeline tests against a running server
npm run db:migrate # apply schema
npm run db:seed    # demo data
npm run db:reset   # drop, recreate and reseed
```

`schema.sql` is idempotent, so `npm run db:migrate` is safe to re-run. It is
also mounted into the Postgres container, which executes it once on first boot.

### Testing approach

`npm test` runs fully offline — `globalThis.fetch` is stubbed, so the weather
service's response mapping, per-city caching, timeout handling and upstream
error translation are all covered without an API key or network access.

`npm run smoke` needs the server running but *not* a database: it signs a token
from `.env` and asserts that the auth guard, every validation rule and the
route table behave. Requests that reach the database are expected to return
`503`, which is itself a useful assertion that validation ran in the right
order.

---

## Scripts

| Script               | Does what                                              |
| -------------------- | ------------------------------------------------------ |
| `npm start`          | Run the API                                            |
| `npm run dev`        | Run with `--watch`                                     |
| `npm run db:migrate` | Apply `schema.sql`                                     |
| `npm run db:seed`    | Insert the demo user and tasks                         |
| `npm run db:reset`   | Drop tables, reapply the schema, reseed                |
| `npm run check`      | Cross-check JS selectors against page markup           |
| `npm test`           | Weather service unit tests (offline, no API key)       |
| `npm run smoke`      | Request-pipeline tests; needs the server running       |#   T a s k P u l s e  
 