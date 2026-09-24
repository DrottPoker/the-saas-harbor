<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The SaaS Harbor

Next.js 16 App Router and Supabase platform where independent SaaS products get public profiles and rank on a self-reported MRR leaderboard. Read `README.md`, `docs/ARCHITECTURE.md` and `docs/STATUS.md` before larger changes.

## Commands

- `npm run check` before handing over any change: Prettier, ESLint, TypeScript and unit tests.
- `npm run build` after changes to routing, config or the server/client boundary.
- `npm run db:start`, then `npm run test:db` and `npm run test:e2e`, after changes to the schema, auth, forms or pages. Docker must be running. Local Supabase uses ports 55320-55329.
- `npm run format` formats the codebase.
- `npm run dev` starts local Supabase if needed, syncs `.env.local` and serves the app on http://localhost:3001. `npm run db:seed` adds fictional demo data. Mailpit at http://127.0.0.1:55324 receives every email; Studio is at http://127.0.0.1:55323. Browser tests start their own server on port 3002.

## Rules

- Schema changes go in a new file in `supabase/migrations`. Never edit an applied migration. Then run `npm run db:reset` and `npm run db:types`, and extend `supabase/tests/database`.
- Supabase runs only locally in Docker. Do not connect the app to a hosted Supabase project, or write to one, without explicit approval. The old hosted project `qvvqkskyukqoleuivdfw` is unused.
- Never stop or reset other projects' local Supabase containers (for example `one-life-at-sea` on the 543xx ports).
- Every exposed table needs RLS and explicit grants. Views use `security_invoker = true`. The app never uses a service-role key.
- Money is integer USD cents. Never use floating point for revenue.
- Mutations are Server Actions that call `requireUser()`, with RLS as the second layer. Public reads use `publicClient()` so they never carry a session.
- Validate input on the server with the zod schemas in `src/lib/domain.ts`.
- Keep the Axe scans in `tests/e2e` passing and add new pages to them.
- UI: use the tokens in `src/app/globals.css` through Tailwind utilities and the shared components in `src/components`. No hardcoded colors, no new global CSS classes, no text below 12 px, one accent color, plain copy without metaphors. New colors need a light value and a dark value. Check new screens at 390 px and 1440 px wide, in both themes.
- Update `README.md`, `docs/ARCHITECTURE.md` and `docs/STATUS.md` when behavior, setup or known issues change.
- Never share `supabase status` output: it contains local keys.
