<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The SaaS Harbor

Next.js 16 App Router and Supabase platform where independent SaaS products get public profiles and rank on a leaderboard of MRR verified through read-only Stripe keys. Read `README.md`, `docs/ARCHITECTURE.md` and `docs/STATUS.md` before larger changes.

## Commands

- `npm run check` before handing over any change: Prettier, ESLint, TypeScript and unit tests.
- `npm run build` after changes to routing, config or the server/client boundary.
- `npm run db:start`, then `npm run test:db` and `npm run test:e2e`, after changes to the schema, auth, forms or pages. Docker must be running. Local Supabase uses ports 55320-55329.
- `npm run format` formats the codebase.
- `npm run dev` starts local Supabase if needed, syncs `.env.local` (including generated server secrets) and serves the app on http://localhost:3001. `npm run stripe:sync` re-verifies Stripe connections through it. `npm run db:seed` adds fictional demo data. Mailpit at http://127.0.0.1:55324 receives every email; Studio is at http://127.0.0.1:55323. Browser tests start their own server on port 3002.

## Rules

- Schema changes go in a new file in `supabase/migrations`. Never edit a migration that is committed or applied outside this machine. Apply locally with `npx supabase migration up --local` (keeps local accounts; `npm run db:reset` deletes them), confirm `npx supabase db diff --local` reports no changes, run `npm run db:types`, and extend `supabase/tests/database`.
- Supabase runs only locally in Docker. Do not connect the app to a hosted Supabase project, or write to one, without explicit approval. The old hosted project `qvvqkskyukqoleuivdfw` is unused.
- `supabase/.env.local` holds per-machine SMTP credentials. Never read out, print or commit its password. Use `npm run db:restart -- --mailpit` before browser tests when real email is on.
- Never stop or reset other projects' local Supabase containers (for example `one-life-at-sea` on the 543xx ports). Never reset Docker Desktop to factory defaults: it deletes all local databases. See README for the stale socket fix when Docker does not start.
- Every exposed table needs RLS and explicit grants. Views use `security_invoker = true`. Only `src/lib/supabase/admin.ts` uses the service-role key, for Stripe verification writes; never use it for anything a maker controls directly.
- Messages are written only through `send_message()`. Realtime events carry ids, never message text; clients read messages under RLS. New ways of reading messages must keep the participant check.
- Admin rights live in `private.admins` and are never granted from the app. Every admin page calls `requireAdmin()` and every admin Server Action `adminSession()`; moderation state changes only through the `admin_*` database functions, and reports only through `submit_report()`. Admins see a message only as the copy stored with a report. New public reads must keep hidden products and suspended accounts out.
- Revenue never comes from user input. Verified figures are written only through `record_stripe_verification`. Never log or print Stripe keys, encrypted or not, and never change `STRIPE_KEY_ENCRYPTION_KEY` without a re-encryption plan.
- Personal data: anything new that stores data about a person must be described in the privacy policy (`src/app/privacy/page.tsx`, with a new `privacyUpdated` date in `src/lib/legal.ts`) and removed by account deletion (`public.delete_account()` and `src/lib/account.ts`), with a test. Product-scoped tables need an `on delete cascade` foreign key to `saas`, so product deletion removes them too.
- Stored money is integer USD cents. MRR normalization may use fractions, but rounds once at the end (`src/lib/stripe/mrr.ts`).
- Mutations are Server Actions that call `requireUser()`, with RLS as the second layer. Public reads use `publicClient()` so they never carry a session.
- Validate input on the server with the zod schemas in `src/lib/domain.ts`.
- Keep the Axe scans in `tests/e2e` passing and add new pages to them.
- UI: use the tokens in `src/app/globals.css` through Tailwind utilities and the shared components in `src/components`. No hardcoded colors, no new global CSS classes, no text below 12 px, one accent color, plain copy without metaphors. New colors need a light value and a dark value. Check new screens at 390 px and 1440 px wide, in both themes.
- Update `README.md`, `docs/ARCHITECTURE.md` and `docs/STATUS.md` when behavior, setup or known issues change.
- Never share `supabase status` output: it contains local keys.
