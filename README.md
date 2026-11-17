# Randevum API

REST API for booking appointments at small businesses such as barbers, beauty salons and dental clinics. Business owners publish their services and working hours; customers see free time slots and book them.

**Stack:** Node.js 20, TypeScript, Express 5, PostgreSQL 16 (raw SQL with `pg`), Zod, JWT, Vitest, Supertest, Docker, GitHub Actions

## Features

- **Two roles:** customers book appointments, owners manage businesses, services and working hours
- **Availability:** free slots for a service on a given day, calculated from working hours and existing bookings
- **No double bookings:** a PostgreSQL exclusion constraint guarantees that two bookings never overlap, even when requests arrive at the same moment
- **Appointment lifecycle:** `pending → confirmed → completed`, or `cancelled`; customers can only cancel until the business's cancellation deadline
- **Auth:** short-lived access tokens (15 min) and refresh tokens with rotation and reuse detection
- **Timezones:** each business has its own timezone; slots are correct across daylight saving changes
- **Search:** filter businesses by city, category and text, with pagination
- **API docs:** OpenAPI 3 spec served with Swagger UI at `/docs`

## Quick start

With Docker:

```bash
docker compose up --build
# API:  http://localhost:4000
# Docs: http://localhost:4000/docs
```

Without Docker (needs a local PostgreSQL):

```bash
cp .env.example .env    # set DATABASE_URL and JWT_ACCESS_SECRET
npm install
npm run migrate
npm run seed            # optional demo data
npm run dev
```

The seed creates three businesses and two users: `owner@randevum.dev` and `customer@randevum.dev` (password `password123`).

## Example flow

```bash
# 1. Log in as a customer
curl -X POST localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@randevum.dev","password":"password123"}'

# 2. Find free slots for service 1 of business 1
curl 'localhost:4000/api/v1/businesses/1/availability?serviceId=1&date=2026-12-01'
# { "slots": ["2026-12-01T09:00:00.000+03:00", "2026-12-01T09:15:00.000+03:00", ...] }

# 3. Book one
curl -X POST localhost:4000/api/v1/appointments \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"serviceId":1,"startsAt":"2026-12-01T09:00:00+03:00"}'

# Booking the same slot again returns 409 { "error": { "code": "SLOT_TAKEN", ... } }
```

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/v1/auth/register`, `/login`, `/refresh`, `/logout` | everyone |
| GET | `/api/v1/auth/me` | logged in |
| GET | `/api/v1/businesses?city=&category=&q=&page=&limit=` | everyone |
| GET | `/api/v1/businesses/:id` | everyone |
| GET | `/api/v1/businesses/:id/availability?serviceId=&date=` | everyone |
| POST | `/api/v1/businesses` | owner |
| GET | `/api/v1/businesses/mine` | owner |
| PATCH | `/api/v1/businesses/:id` | owner of the business |
| PUT | `/api/v1/businesses/:id/working-hours` | owner of the business |
| POST | `/api/v1/businesses/:id/services` | owner of the business |
| GET | `/api/v1/businesses/:id/appointments?date=&status=` | owner of the business |
| PATCH / DELETE | `/api/v1/services/:id` | owner of the service |
| POST | `/api/v1/appointments` | customer |
| GET | `/api/v1/appointments/me?status=&upcoming=` | logged in |
| PATCH | `/api/v1/appointments/:id/status` | customer or owner (different rules) |

Full request and response details are in [`docs/openapi.yaml`](docs/openapi.yaml) and at `/docs` while the server runs.

Errors always look like this:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Validation failed", "details": [{ "field": "email", "message": "Invalid email address" }] } }
```

## Project structure

```
src/
├── app.ts                     # Express app: middleware, routers, error handling
├── server.ts                  # starts the HTTP server, graceful shutdown
├── config/env.ts              # validates environment variables on startup
├── db/
│   ├── pool.ts                # pg pool + transaction helper
│   ├── migrate.ts             # tiny migration runner (schema_migrations table)
│   ├── seed.ts
│   └── migrations/001_init.sql
├── middleware/                # authentication, role checks, error handler
├── lib/                       # errors, validation, slugs, logger
└── modules/
    ├── auth/                  # register, login, token rotation
    ├── businesses/
    ├── services/
    └── appointments/
        ├── availability.ts    # slot calculation (pure functions, unit tested)
        ├── transitions.ts     # who can change which status
        └── appointment.service.ts
tests/                         # unit + integration tests
```

Each module has `*.routes.ts` (HTTP layer: parse input, call the service, send the response), `*.schemas.ts` (Zod validation) and `*.service.ts` (business logic and SQL).

## Design decisions

**Preventing double bookings in the database.** Checking "is this slot free?" in code and then inserting has a race condition: two requests can both see the slot as free and both insert. Instead, the `appointments` table has an exclusion constraint:

```sql
EXCLUDE USING gist (business_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('pending', 'confirmed'))
```

PostgreSQL rejects any active appointment that overlaps another one of the same business. The error handler turns that into `409 SLOT_TAKEN`. A test fires five simultaneous requests for the same slot and checks that exactly one succeeds. Cancelled appointments are excluded from the constraint, so a cancelled slot can be booked again.

**Raw SQL instead of an ORM.** The queries here (range overlaps, `json_agg` for nested data, window functions for pagination counts) are easier to write and read in SQL. All values are passed as parameters; the few dynamic column names in `UPDATE` statements come from a fixed whitelist.

**Refresh token rotation.** Refresh tokens are random strings stored only as SHA-256 hashes. Each one can be used once. If an already used token comes back, someone may have stolen it, so all sessions of that user are revoked.

**Timezones.** Times are stored as `timestamptz` (UTC). Working hours are local times (`09:00`), interpreted in the business's timezone with Luxon, so slots stay at 09:00 local time even on days when clocks change.

**Status rules in one table.** Allowed transitions are a small lookup table in `transitions.ts` instead of `if` statements spread across the code.

## Tests

```bash
npm test
```

34 tests: unit tests for slot calculation, status transitions and slugs, plus integration tests that run the real Express app against PostgreSQL with Supertest (auth, permissions, booking, concurrency, cancellation rules). Tests use a separate database (`TEST_DATABASE_URL`, default `randevum_test`) that is reset before each run.

CI runs lint, type check, tests and build on every push.

## Possible next steps

- Multiple staff members per business, each with their own calendar
- SMS / e-mail reminders before appointments (job queue)
- Holidays and one-off closed days
