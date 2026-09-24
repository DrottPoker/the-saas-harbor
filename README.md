# The SaaS Harbor

A focused, responsive home for independent SaaS: public maker profiles, product discovery, and a leaderboard of self-reported monthly recurring revenue.

## Included

- Email/password registration, email confirmation, sign-in, sign-out, and password recovery.
- Public maker profiles with an image, bio, website and social link.
- Multiple SaaS profiles per maker, with a logo, pitch, description, category and website.
- Optional MRR in USD, paying customers and launch date, each with an independent public-sharing choice.
- Dated private metric reports, exact USD cents, a public leaderboard, category/name filters and newest arrivals.
- Supabase RLS, owner checks in Server Actions, and owner-scoped image uploads.
- Light and dark themes.

Sales, escrow, company profiles, messaging and advanced revenue verification are outside this release.

## Run locally

Requires Node.js 22.14 or later (see `.nvmrc`), npm and Docker Desktop. Dependencies have exact versions and a lockfile, and `.npmrc` keeps new installs exact.

The whole backend runs locally: Supabase (PostgreSQL, Auth, Storage) runs in Docker through the Supabase CLI. There is no hosted Supabase project in use.

```powershell
npm ci
npm run dev        # starts local Supabase if needed, then http://localhost:3001
npm run db:seed    # optional: 8 fictional makers and 16 SaaS
```

Before the dev server starts, `npm run dev` runs `scripts/local-env.mjs`. It starts the local Supabase stack when it is not running (the first start downloads Docker images) and writes the local URLs and public key into `.env.local`. Other lines in `.env.local` are kept. `npm run env:local` does the same without starting the app.

| Local service                        | Address                |
| ------------------------------------ | ---------------------- |
| App                                  | http://localhost:3001  |
| Supabase API                         | http://127.0.0.1:55321 |
| Supabase Studio (tables, users, SQL) | http://127.0.0.1:55323 |
| Mailpit (every email the app sends)  | http://127.0.0.1:55324 |

Auth is Supabase Auth. Locally, confirmation and password reset emails never reach a real inbox: Mailpit catches them all, and the sign-in pages link to it. Open the link in the same browser you signed up in, since PKCE links only work there. Use `http://localhost:3001` consistently rather than `127.0.0.1:3001`, because the session cookies are tied to the hostname.

### Real email

Local Auth can deliver email to real inboxes through any SMTP provider. The settings live in `supabase/.env.local`, which is git-ignored and overrides the committed defaults in `supabase/.env` (real email off). For Gmail:

1. Turn on 2-Step Verification for the Google account and create an app password at https://myaccount.google.com/apppasswords.
2. In `supabase/.env.local`, set `HARBOR_SMTP_ENABLED=true`, `HARBOR_SMTP_HOST=smtp.gmail.com`, `HARBOR_SMTP_PORT=587`, your address as `HARBOR_SMTP_USER` and `HARBOR_SMTP_ADMIN_EMAIL`, and the app password as `HARBOR_SMTP_PASS`.
3. Run `npm run db:restart`. It prints where Auth email goes.

Without a password the stack falls back to Mailpit. The links in the emails point at this computer (`127.0.0.1`), so open them on the same computer and in the same browser you signed up in. The browser tests need Mailpit and refuse to run while real email is on; `npm run db:restart -- --mailpit` switches back until the next plain restart.

Demo accounts from `npm run db:seed` are `<name>@demo.harbor.test` (for example `lena@demo.harbor.test`) with the password `harbor-demo-password`. Re-running the seed replaces earlier demo accounts, and `npm run db:reset` rebuilds the database from the migrations without any data. The ports 55320-55329 keep this stack clear of other local Supabase projects on the default 543xx ports. `npm run db:stop` stops the stack and keeps the data.

| Variable                               | Meaning                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase API URL, locally `http://127.0.0.1:55321`                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key, never a secret or service-role key          |
| `NEXT_PUBLIC_SITE_URL`                 | Canonical app origin, locally `http://localhost:3001`               |
| `LOCAL_MAILPIT_URL`                    | Local development only: shows the local inbox link on sign-in pages |

## Verification

```powershell
npm run check         # Prettier, ESLint, TypeScript and unit tests
npm run build
```

Format code with `npm run format`. CI (`.github/workflows/ci.yml`) runs the same checks, the build, the database tests and the browser tests on pushes to `main` and `development` and on pull requests.

### Browser and database tests

These run against the local stack and Mailpit.

```powershell
npm run db:start
npx playwright install chromium
npm run test:db
npm run test:e2e
```

The browser test runner reads local CLI credentials and the Mailpit URL directly into its process environment, refuses non-loopback addresses, and starts the app on `http://127.0.0.1:3002` with a separate build directory, so it can run next to `npm run dev`. Do not share local CLI status output: it includes local test keys. Test users and files are removed afterward, and the tests work with or without demo data. Browser tests cover registration and confirmation, login and session persistence, profile/SaaS editing, error-state input retention, images, multiple SaaS, private/public MRR, revocation, cross-owner denial, password recovery, page titles, themes, responsive layout, and automated WCAG 2.1 AA scans of public, auth and owner pages in both themes.

`supabase/tests/database/access.test.sql` is a pgTAP suite run by `npm run test:db`. It runs in a transaction that is rolled back and checks actual database grants, RLS, storage ownership, private history, numeric ranking, zero MRR, revocation and independent visibility.

### Database changes

Add every schema change as a new file in `supabase/migrations` (`npx supabase migration new <name>`), never by editing applied migrations. Apply it locally with `npm run db:reset`, regenerate `src/lib/supabase/database.types.ts` with `npm run db:types`, and extend the pgTAP suite.

### Production preview

```powershell
npm run build
npm start
```

This serves a production build on http://localhost:3001 against the local stack configured in `.env.local`. Where Supabase runs in production (self-hosted or Supabase Cloud), SMTP and deployment are still open decisions; see [status](docs/STATUS.md).

## Project notes

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Scope and implementation plan](docs/PLAN.md)
- [Verification status, known issues and next steps](docs/STATUS.md)
- [Instructions for coding agents](AGENTS.md)
