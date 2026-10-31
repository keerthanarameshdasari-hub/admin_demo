# admin_demo

Back-office portal (React + Vite + TypeScript) for the wallet demo
(`backend_demo`, `admin_demo`, `frontend_demo`, `infra_demo`). Admins sign in, review KYC
submissions, browse users and look at wallet top-ups.

Branch flow: `feature/*` → `dev` → `test` → `main`, each step by pull request.
[docs/ci.md](docs/ci.md) explains what runs on every pull request.

| Page | Path | What it does |
|---|---|---|
| Sign in | `/login` | Email and password. Only accounts with `role: ADMIN` get in. |
| KYC review | `/kyc` | Every submission, newest first, filterable by status. **Approve** a rejected or timed-out one, **Reject** (with a reason the user sees) an approved or timed-out one. |
| Users | `/users` | Every user with role and KYC status, filterable by KYC status. Links to each user's transactions. |
| Transactions | `/transactions` | Every wallet top-up with its user, amount, status and failure reason. Filter by status, or by user (`?userId=`). |

Filters and paging live in the URL, so a view can be shared.

## Run it locally

Needs Node 26.

```sh
npm ci
```

**Against the mock API** (no backend needed; the same mock the tests use):

```sh
npm run mock-api                                          # http://127.0.0.1:9090
echo '{ "apiBaseUrl": "http://127.0.0.1:9090" }' > public/config.json
npm run dev                                               # http://localhost:5173
```

Sign in as `admin@example.com` / `admin-password-1`. `ravi@example.com` / `ravi-password-1` is a
regular user, to see the "not an admin" refusal.

**Against a real backend_demo:** start it with `CORS_ALLOWED_ORIGINS=http://localhost:5173`, make
yourself an admin there (`npm run admin:promote -- you@example.com` in backend_demo), point
`public/config.json` at it (e.g. `http://localhost:3000`) and run `npm run dev`.

`public/config.json` is git-ignored: it belongs to the environment, not the code.

## One build, configured at deploy time

The build contains nothing environment-specific. On start-up the app fetches `/config.json`
(uncached) and refuses to start if it's missing or invalid:

```json
{ "apiBaseUrl": "https://api.dev.example.com" }
```

So `dist/` is built **once, on `dev`**, and the same files are promoted to `test` and `main`.
Each environment's deploy downloads that build and writes its own `config.json` next to
`index.html`:

```sh
node scripts/write-config.mjs dist https://api.dev.example.com
```

The script validates the URL with the app's own parser, so a value the app would reject fails
the deploy instead. CI's bundle check fails if a `config.json` ever ends up in the build.

Hosting needs:

- an SPA fallback: unknown paths serve `index.html` (`/kyc` is a client-side route);
- `Cache-Control: no-store` on `index.html` and `config.json`; `/assets/*` is content-hashed and
  can be cached for a year;
- the backend's `CORS_ALLOWED_ORIGINS` to include the portal's origin.

Source maps are built (`dist/assets/*.map`) but not referenced from the JS. Upload them to your
error tracker and don't serve them, or delete them before upload.

## Sign-in and tokens

The access token from `POST /auth/login` is kept **in memory only** (`src/auth/session.ts`): never
in `localStorage`, `sessionStorage`, IndexedDB or a readable cookie. An ESLint rule forbids those
APIs in `src/`, and both the component tests and the E2E suite check that nothing was stored.

- After login the app calls `GET /users/me` and throws the token away unless `role` is `ADMIN`.
- It is sent as `Authorization: Bearer …` only to the configured API.
- It is dropped when it expires, when the API answers 401, or when the API says the account is no
  longer an admin (403 "Admin access required"); the login page says which.
- The cost: **reloading the page signs you out.** That's deliberate for a back-office tool. The
  alternative, an httpOnly session cookie, would need backend_demo to set the cookie and add CSRF
  protection; it currently only issues bearer tokens.

## API client

`src/api/schema.d.ts` is generated from `api/openapi.json`, which is a verbatim copy of
backend_demo's `openapi.json` at a pinned version. `api/openapi.lock.json` records which: the
tag, the commit, the API version and the file's sha256. The build never contacts the backend,
so every build of a given commit uses the same contract.

To move to a newer API:

```sh
npm run api:fetch -- api-v0.3.0   # copy that tag's openapi.json, update the lock, regenerate the client
npm run typecheck                 # see what the new contract breaks
```

`npm run api:fetch -- --commit <sha>` pins an untagged commit; the lock records `"tag": null` and
CI warns until it's pinned to a tag.

Every request and response is typed from the schema (via `openapi-fetch`), and so are the mock
fixtures. A field or path the backend renames or removes is a compile error. `npm run api:canary`
proves it: it renames fields and a path the portal uses, one at a time, and fails unless `tsc`
breaks in app code for each.

## Tests

| Command | What |
|---|---|
| `npm test` | Vitest + Testing Library in jsdom: config parsing, formatting, sign-in/out and token handling, and each page through the real router and API client. The API is mocked with [MSW](https://mswjs.io) (`src/mocks/`), which mirrors backend_demo's rules (admin check, validation, KYC override rules). Unmocked requests fail the test. |
| `npm run build && npm run e2e` | Playwright, headless Chromium, against the **production build**. `e2e/mock-api-server.ts` serves the same MSW handlers on a real port (cross-origin, with CORS), and the run writes a `config.json` into a copy of `dist/`, as a deploy would. Covers login, approve KYC, reject KYC and viewing transactions. First time: `npx playwright install chromium`. |

## Scripts

| Script | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite. |
| `npm run lint` / `format` / `format:check` | ESLint, Prettier. |
| `npm run typecheck` | `tsc` for the app and for the tooling/E2E code. |
| `npm run api:fetch -- <tag>` | Pin the backend spec (see above). |
| `npm run api:check` | Offline: the spec matches its lock, and the committed client matches the spec. |
| `npm run api:canary` | Renamed API fields must break `tsc`. |
| `npm run bundle:check` | Gzipped JS/CSS within `bundle-budget.json`, no mocks or `config.json` in `dist/`. |
| `npm run mock-api` | The MSW mock API on port 9090. |
