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

Requires Node.js 22.14 or later and npm. Dependencies have exact versions and a lockfile.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in public project configuration locally. Never put secret or service-role keys here.
npm run dev
```

Open http://localhost:3000. The server binds to the local loopback interface.

The current checkout already has an ignored `.env.local` configured for the existing **The SaaS Harbor** Supabase project, reference `qvvqkskyukqoleuivdfw`, in `eu-central-1`. Do not replace it with the example if it is already configured. No new hosted project was created.

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL, such as `https://your-project-ref.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key, never a secret/service-role key |
| `NEXT_PUBLIC_SITE_URL` | Canonical app origin; locally `http://localhost:3000` |

Use one consistent hostname while signing up, confirming an email, or recovering a password. PKCE email links need to open in the same browser that initiated the request.

## Supabase account setup

[Open the project dashboard](https://supabase.com/dashboard/project/qvvqkskyukqoleuivdfw).

The three SQL migrations in `supabase/migrations` are already applied to this project. They create four RLS-protected tables, two public invoker views, one invoker save function, indexes, and the `profile-images` bucket. Local filenames match the hosted migration versions.

Before using real email accounts, check **Authentication > URL Configuration**:

- Site URL: `http://localhost:3000` for local use.
- Allowed redirect: `http://localhost:3000/auth/callback`.
- Allowed recovery redirect: `http://localhost:3000/auth/callback?next=update`.
- Keep email confirmation enabled. Email signup and confirmation were confirmed enabled through the public Auth settings endpoint.

Configure production SMTP in Supabase for reliable delivery to real users. The default Supabase mail service has recipient/rate restrictions. Hosted email delivery and the hosted redirect allowlist were not tested using a real mailbox. Do not disable confirmation to bypass email setup. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

No service-role credential is needed by the app. No website has been deployed externally.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
node scripts/check-hosted.mjs
```

The hosted check reads only public resources, confirms anonymous metric-history denial, and reports safe Auth settings. It never prints keys, creates users or sends email.

### Isolated browser and database tests

Docker Desktop must be running. These use an entirely local Supabase stack with a local Mailpit inbox. The hosted project is not seeded or modified by the browser tests.

```powershell
npx supabase start
npx playwright install chromium
npm run test:e2e
Get-Content supabase/tests/access.sql -Raw | docker exec -i supabase_db_the-saas-harbor psql -U postgres -d postgres -v ON_ERROR_STOP=1 --quiet
npx supabase stop
```

The test runner reads local CLI credentials directly into its process environment, refuses a non-loopback API, and starts the app on `http://127.0.0.1:3001` with a separate build directory. Do not share local CLI status output: it includes local test keys. Test users and files are removed afterward. Browser tests cover registration and confirmation, login and session persistence, profile/SaaS editing, error-state input retention, images, multiple SaaS, private/public MRR, revocation, cross-owner denial, password recovery, responsive layout, and an automated accessibility scan of the homepage.

`supabase/tests/access.sql` uses a transaction that is rolled back. It checks actual database permissions, storage ownership, private history, numeric ranking, zero MRR, and independent visibility. The current CLI cannot run this multi-statement file with `db query --file`; use the Docker/psql command above or the SQL editor as one transaction.

### Production preview

```powershell
npm run build
npm start
```

Future Vercel deployment needs the three application variables and matching Supabase Auth URLs. Deployment is not part of this implementation.

## Project notes

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Scope and implementation plan](docs/PLAN.md)
- [Verification status and remaining account setup](docs/STATUS.md)

All source files are present in the checkout. There are no commits or pushes from this implementation.
