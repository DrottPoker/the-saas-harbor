# The SaaS Harbor

A focused, responsive home for independent SaaS: public maker profiles, product discovery, and a leaderboard of self-reported monthly recurring revenue.

## Included

- Email/password registration, email confirmation, sign-in, sign-out, and password recovery.
- Public maker profiles with an image, bio, website and social link.
- Multiple SaaS profiles per maker, with a logo, pitch, description, category and website.
- Optional MRR in USD, paying customers and launch date, each with an independent public-sharing choice.
- Dated private metric reports, exact USD cents, a public leaderboard, category/name filters and newest arrivals.
- Supabase RLS, owner checks in Server Actions, and owner-scoped image uploads.
- Clear empty/error/configuration states. There is no seeded public demo data.

Sales, escrow, company profiles, messaging and advanced revenue verification are outside this release.

## Run locally

Requires Node.js 22.14 or later (see `.nvmrc`) and npm. Dependencies have exact versions and a lockfile, and `.npmrc` keeps new installs exact.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in public project configuration locally. Never put secret or service-role keys here.
npm run dev
```

Open http://localhost:3001. The server binds to the local loopback interface. `npm run dev` uses the hosted project configured in `.env.local`.

### Local development with demo data

For day-to-day work, run the app against the local Supabase stack instead of the hosted project (Docker must be running):

```powershell
npm run db:start
npm run db:seed    # 8 fictional makers and 16 SaaS, local only
npm run dev:local  # http://localhost:3001 against the local stack
```

Demo accounts are `<name>@demo.harbor.test` (for example `lena@demo.harbor.test`) with the password `harbor-demo-password`. Re-running `npm run db:seed` replaces earlier demo accounts. `npm run db:reset` removes them. The seed and dev scripts refuse anything that is not a local stack.

The current checkout already has an ignored `.env.local` configured for the existing **The SaaS Harbor** Supabase project, reference `qvvqkskyukqoleuivdfw`, in `eu-central-1`. Do not replace it with the example if it is already configured. No new hosted project was created.

| Variable                               | Meaning                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project API URL, such as `https://your-project-ref.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key, never a secret/service-role key         |
| `NEXT_PUBLIC_SITE_URL`                 | Canonical app origin; locally `http://localhost:3001`           |

Use one consistent hostname while signing up, confirming an email, or recovering a password. PKCE email links need to open in the same browser that initiated the request.

## Supabase account setup

[Open the project dashboard](https://supabase.com/dashboard/project/qvvqkskyukqoleuivdfw).

The three SQL migrations in `supabase/migrations` are already applied to this project. They create four RLS-protected tables, two public invoker views, one invoker save function, indexes, and the `profile-images` bucket. Local filenames match the hosted migration versions.

Before using real email accounts, check **Authentication > URL Configuration**:

- Site URL: `http://localhost:3001` for local use.
- Allowed redirect: `http://localhost:3001/auth/callback`.
- Allowed recovery redirect: `http://localhost:3001/auth/callback?next=update`.
- Keep email confirmation enabled. Email signup and confirmation were confirmed enabled through the public Auth settings endpoint.

Configure production SMTP in Supabase for reliable delivery to real users. The default Supabase mail service has recipient/rate restrictions. Hosted email delivery and the hosted redirect allowlist were not tested using a real mailbox. Do not disable confirmation to bypass email setup. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

No service-role credential is needed by the app. No website has been deployed externally.

## Verification

```powershell
npm run check         # Prettier, ESLint, TypeScript and unit tests
npm run build
npm run check:hosted  # Read-only checks against the hosted project
```

The hosted check reads only public resources, confirms anonymous metric-history denial, and reports safe Auth settings. It never prints keys, creates users or sends email.

Format code with `npm run format`. CI (`.github/workflows/ci.yml`) runs the same checks, the build, the database tests and the browser tests on pushes to `main` and `development` and on pull requests.

### Isolated browser and database tests

Docker Desktop must be running. These use an entirely local Supabase stack with a local Mailpit inbox. The hosted project is never seeded or modified by the tests.

```powershell
npm run db:start
npx playwright install chromium
npm run test:db
npm run test:e2e
npm run db:stop
```

The local stack uses ports 55320-55329 (API `http://127.0.0.1:55321`, Studio `http://127.0.0.1:55323`, Mailpit `http://127.0.0.1:55324`), so it can run next to other local Supabase projects on the default 543xx ports. `npm run db:reset` rebuilds the local database from the migrations.

The browser test runner reads local CLI credentials and the Mailpit URL directly into its process environment, refuses non-loopback addresses, and starts the app on `http://127.0.0.1:3002` with a separate build directory. Do not share local CLI status output: it includes local test keys. Test users and files are removed afterward. Browser tests cover registration and confirmation, login and session persistence, profile/SaaS editing, error-state input retention, images, multiple SaaS, private/public MRR, revocation, cross-owner denial, password recovery, page titles, responsive layout, and automated WCAG 2.1 AA scans of public, auth and owner pages, including pages with shared data.

`supabase/tests/database/access.test.sql` is a pgTAP suite run by `npm run test:db`. It runs in a transaction that is rolled back and checks actual database grants, RLS, storage ownership, private history, numeric ranking, zero MRR, revocation and independent visibility.

### Database changes

Add every schema change as a new file in `supabase/migrations` (`npx supabase migration new <name>`), never by editing applied migrations or changing the hosted database by hand. Apply it locally with `npm run db:reset`, regenerate `src/lib/supabase/database.types.ts` with `npm run db:types`, and extend the pgTAP suite. The hosted project receives the migration only after review.

### Production preview

```powershell
npm run build
npm start
```

Future Vercel deployment needs the three application variables and matching Supabase Auth URLs. Deployment is not part of this implementation.

## Project notes

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Scope and implementation plan](docs/PLAN.md)
- [Verification status, known issues and next steps](docs/STATUS.md)
- [Instructions for coding agents](AGENTS.md)
