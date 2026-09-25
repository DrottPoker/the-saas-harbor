# Implementation status

Updated 2026-09-25 with demo products, email notifications, readable addresses and sharing cards, a Content Security Policy, email links that work on any device, and reports with an admin panel. The project was reviewed and handed over 2026-09-24; the first release was built 2026-09-12 and committed on the `development` branch.

## Implemented

The first release includes accounts, email confirmation and recovery, public maker profiles, multiple editable SaaS per owner, profile/logo uploads, SaaS and maker pages, category/name filtering, newest arrivals, and a USD MRR leaderboard. Each optional metric has a sharing control. Private verification history and the current public projection are separate and protected by RLS. No demo data is displayed as real activity.

Makers can message each other privately (see Messages below), and report products, profiles and messages to the admins, who decide in an admin panel (see Reports and moderation below). They get emails about unread messages and about decisions (see Email notifications below). Other forms of connection, such as following or contact lists, are not implemented.

## Demo products 2026-09-25

The project owner asked for realistic demo products, clearly marked, so that the first visitors do not find an empty directory, and for them to go as real products arrive.

- Fifteen made-up products with makers, logos, descriptions, figures and a 12-month history fill the first page of the leaderboard, Browse and New arrivals after the real products, in their own Demo products section. Each real product takes one demo place, and all of them disappear once 12 real products share verified MRR. `DEMO_PRODUCTS=off` hides them at once.
- They are marked Demo in every row, card and page, are never ranked or called verified, and have no website, maker page or contact. Their pages under `/demo` are kept out of search engines and the sitemap. They live only in code, so the database and everything that reads it hold real products only.
- The names were checked against existing products when they were chosen, and candidates that already belonged to a product were replaced.
- At the owner's request, the earlier local demo data from `npm run db:seed` (9 accounts with 16 products, their images and reports) was removed from the local database with the new `npm run db:seed -- --remove`. The seed still exists for testing; its products count as real listings.

Choices the owner should confirm: 12 real products as the point where demo products are gone (one full page), demo products in Browse and New arrivals as well as on the leaderboard, and the made-up figures, from $1,940 to $38,400 MRR.

## Email notifications 2026-09-25

Makers now hear about what happens while they are away:

- One email per unread conversation, five minutes after the first unread message if it is still unread, with the sender's name and a link to the conversation. It never contains the message. The next one comes only after the maker has read the conversation.
- Admins get an email when reports come in, at most one an hour, with the number of open reports.
- Makers get an email when an admin hides or restores a product, or suspends or restores their account, with the reason and the explanation. Reporters get an email when their report has been reviewed, saying whether action was taken.
- Dashboard → Email settings turns message emails off, and report emails for admins. Decision and outcome emails are always sent, like sign-in emails.

The database queues each email with the event that causes it, and the app sends them through any SMTP provider: right after the action, and from `POST /api/email/send`, which production must call every minute (see ARCHITECTURE). Locally they arrive in Mailpit, and `npm run email:send` sends the delayed message emails. The privacy policy describes the settings, the queue and the record kept for a week. pgTAP covers what queues an email and what does not, including an unread message that must count in one email only; the browser tests read the emails in Mailpit.

Choices the owner should confirm: the five-minute wait before a message email; one email per conversation until it is read; report emails at most hourly; decision and outcome emails cannot be turned off; the emails are in English only.

## Addresses and sharing 2026-09-25

Products and makers have readable addresses made from their names, such as `/saas/querybird` and `/makers/tomas-rivera`. Links with the old ids answer with a permanent redirect, a renamed product keeps its old address as a redirect, and a renamed maker's old address stops working, since it came from the person's name. Product, maker and site pages have canonical links, Open Graph and Twitter card metadata, and a generated sharing card that shows only public figures. `sitemap.xml` lists listed products and their makers, and `robots.txt` keeps crawlers out of private areas. pgTAP covers slug generation, uniqueness, renames, redirects and hidden products; the browser tests cover the redirect status, canonical links, the card image, the sitemap and renaming.

## Content Security Policy 2026-09-25

Every response now carries a Content Security Policy with a fresh nonce per request: scripts run only with the nonce, `eval` only in development, and images and connections are limited to the site and Supabase (including the Realtime websocket). Framing, plugins, foreign form targets and `<base>` changes are refused. Production responses also send `Strict-Transport-Security`. The browser tests fail on any blocked resource and check that the nonce changes between requests; a probe confirmed that Chromium reports blocked scripts and images to the console, where the tests look.

## Email links on any device 2026-09-25

Confirmation and password reset links used PKCE, so they only worked in the browser that signed up or asked for the reset: a confirmation opened on a phone showed an error, and a reset link did not work at all. The emails now come from custom templates in `supabase/templates` and open `/auth/confirm`, which verifies a token hash on the server when the reader presses the button. The links work in any browser, once, and email link scanners cannot use them up by opening them. `/auth/callback` is gone. The browser tests open both links in a second browser and check that a used link is refused.

## Reports and moderation 2026-09-25

The project owner asked for reporting and moderation, the step recommended before a public launch, with a full admin panel.

- Report links on product pages, maker profiles and every received message. Visitors sign in first and continue to the report. A report takes a reason (spam, misleading, impersonation, harassment, illegal content or something else) and, for illegal content and something else, an explanation. Reporters follow their reports under Dashboard → Your reports.
- The admin panel at `/admin`: an overview with open reports and the latest decisions, the report queue (oldest first), products and accounts with search and filters, and a log of every decision. A report page shows the copy of what was reported, the reporter, the maker and other reports about the same thing, next to the possible decisions.
- Admins hide a product or suspend an account with a reason and an explanation. The maker sees both in their dashboard and editors, with a line on how to disagree; the reporter sees whether action was taken. A suspended maker's profile, products and conversations disappear for everyone else, and the account can no longer send messages or reports, but can still sign in, edit and delete it. Both decisions can be reversed.
- An account lists at most 20 products and adds at most 5 a day.
- Terms at `/terms` (a draft), linked from the footer, sign-up and the report form. The privacy policy covers reports, decisions and what admins see. Admins are granted with `npm run admin` (see README); the demo data has an admin and four reports.
- Found and fixed on the way: makers had table-wide insert and update grants on `profiles` and `saas`, so a direct API insert could set `created_at` in the future and keep a product first in New arrivals indefinitely. Column grants now limit makers to the fields they edit.
- Two sources of flaky checks, also fixed: the browser tests could time out while the test server compiled a route for the first time on a busy machine (seen twice, once in the existing registration test), so every route is now requested once before the tests; and the typecheck read the test server's generated route types, which a stopped test run can leave half-written, so `tsconfig.json` now excludes `.next-e2e`.

Choices made here that the owner should confirm: the terms require makers to be at least 18; the product limits of 20 and 5 a day; admins see account email addresses, and join and sign-in dates, in the panel; suspended makers can still sign in; and a reported message is stored as a copy with the report.

## Handover review 2026-09-24

Environment and tooling:

- Local Supabase moved to its own port range (55320-55329). The default 543xx ports were already used by another local project, which blocked the local tests.
- Browser tests read the API and Mailpit URLs from `supabase status` instead of hardcoded ports.
- The SQL access test was rewritten as a pgTAP suite (`supabase/tests/database/access.test.sql`, 24 assertions, `npm run test:db`). It now also proves that owners can upload into their own folder, so the foreign-upload denial is meaningful. A mutation check confirmed that the suite detects broken expectations.
- Prettier added and applied to the whole codebase. `npm run check` runs format, lint, types and unit tests.
- GitHub Actions CI added for checks, build, database tests and browser tests.
- `next-env.d.ts` is generated by Next.js and is no longer tracked, as the installed Next.js docs require. `.gitattributes` enforces LF line endings, `.nvmrc` pins Node 22, and `.npmrc` keeps installs exact.
- `database.types.ts` is regenerated from the local migrations with `npm run db:types`.

Defects fixed:

- Contrast failures (WCAG 2.1 AA) on the sign-in page aside (about 1.5:1) and on top-three leaderboard ranks (about 3.7:1). The earlier Axe scan only covered an empty homepage, so it could not catch these. Axe now scans public, auth and owner pages, including pages with shared data. The rank fix was confirmed by reverting it and watching the scan fail.
- Name search treated `*` as a wildcard, because PostgREST maps `*` to `%`. Wildcard stripping moved into a tested `containsPattern()` function.
- `error.tsx` used `reset()`, which re-renders without re-fetching, so "Try again" repeated a failed server render. It now uses `retry()` (stable in Next.js 16.3). `global-error.tsx` was added for root layout failures.
- SaaS and maker pages had the generic site title. They now set their own title and description through `generateMetadata`, sharing a request-cached loader with the page.
- `currentUser()` is request-cached, so the layout and page no longer make two Auth round trips.

## Interface redesign 2026-09-24

The first interface was generated with ChatGPT and read as generic: a slogan hero with decorative art, uppercase labels above every heading, nautical metaphors in the copy, repeated calls to action and 7-10 px text. It was rebuilt as a calm, data-first product interface:

- The leaderboard is the homepage content, directly under a one-line heading, with search and category filters.
- Neutral palette with one teal accent, Geist type, tabular figures and a 12 px minimum text size.
- Light and dark themes (warm paper and graphite, never pure white or black), chosen in the header menu or following the OS, with no flash on load. Axe checks every page in both themes.
- Browse is sorted A to Z so it no longer duplicates New arrivals.
- Product and maker pages, the dashboard and settings-style editors share one set of components.
- The roughly 1,600 lines of global CSS were replaced by design tokens and Tailwind utilities.
- `npm run db:seed` and `npm run dev:local` give a realistic local dataset for design and development.

The browser tests no longer assume an empty database, check for horizontal scrolling on phone-sized screens both signed out and signed in, and run Axe on every redesigned page.

## Verified 2026-09-25

- `npm run check`: Prettier, ESLint with zero warnings, TypeScript, 133 unit tests: Stripe MRR, invoice history, keys and encryption, chart models, message threads, profile dates and input, sign-in continuation, report and decision input, the Content Security Policy, the notification emails, the demo products and how they fill a list, and the full Stripe read path against the fake Stripe server.
- `npm run build`: Next.js 16.3.5 production build.
- `npm run test:db`: 261 pgTAP assertions in four suites (`access` 113, `moderation` 92, `slugs` 25, `notifications` 31). Two deliberately weakened policies (product visibility and report visibility) were each caught by the moderation suite before being restored, and the notifications suite failed on a version that counted one unread message in two emails. `supabase db diff` reports no drift between the local database and the migrations, and `supabase db lint` reports no errors.
- `npm run test:e2e`: 10 Chromium integration tests with Axe scans in both themes (including the revenue charts, the privacy policy and the terms, the delete sections, messaging, personal profiles, the report pages, every admin page, the notices makers see, the email settings and the demo products and their pages), against local Supabase, local Realtime, Mailpit and a fake Stripe API, passing three times in a row. One run before that failed once in the registration test, where the test server answered Page not found for the new product form; it passed in the four runs after, once alone and three times in the full suite. Failed tests now keep a Playwright trace (see known issue 17).
- The admin and report pages were checked at 390 px and 1440 px in both themes, and with touch emulation for the message Report link.
- The CI workflow has not run on GitHub yet. Its commands were run locally with the same Supabase service exclusions.

## Verified revenue through Stripe 2026-09-24

Makers no longer type in revenue. Each product can connect a Stripe restricted key with read access; the server computes MRR and paying customers from the subscriptions, stores the key encrypted, and re-verifies daily. Decisions by the project owner: products without Stripe are still listed but not ranked; the metric is subscription MRR (standard definition, see ARCHITECTURE); makers choose whether verified figures are public, private by default.

The migration removes the self-reported `metric_reports` and moves visibility choices and launch dates to `saas_settings`. Makers cannot write verified figures, directly or through RPC, and cannot read stored keys. A Stripe subscription can verify one product only, and verifications older than seven days leave the leaderboard. `npm run db:seed` gives demo products verified test-mode snapshots.

Not yet verified against the real Stripe API: the tests use a fake Stripe server with the documented response shapes for API version 2026-08-26.dahlia. Connecting one real test-mode restricted key is the first step before launch, to confirm the permission names shown to makers (Subscriptions, Invoices, Coupons, Prices) and the response shapes, including invoice lines (`parent`, `pricing`, `discount_amounts`, `taxes`). Exchange rates come from Frankfurter's public API.

## Revenue charts 2026-09-24

Verified products now show how their revenue developed. Decisions by the project owner: history covers twelve months, reconstructed from paid Stripe invoices; charts appear on the product page and the leaderboard, not in the maker's editor.

- Product page: an area chart of MRR at each of the last twelve month-ends, with a crosshair tooltip, arrow-key reading for keyboard and screen reader users, and a table view. The MRR figure shows the 30-day growth.
- Leaderboard: a 12-month trend line (from 1024 px wide) and the 30-day growth under each MRR figure (at every width).
- Makers need Invoices: Read on the restricted key. Keys created before this change still verify MRR; the editor tells the maker to replace the key to get history.
- Migration `20260924180000_revenue_history.sql` stores history and the growth basis on each snapshot and projects them publicly only when MRR is shared and fresh (pgTAP covers shared, hidden and stale cases).

## Personal profiles 2026-09-25

Maker profiles are personal: a headline, a location, a longer About, experience with dates and durations, skills, and links to a website, LinkedIn, GitHub and X with icons. Headlines also show on the dashboard and next to the maker on product pages. Existing social links that pointed to LinkedIn, GitHub or X moved to their own fields. The demo data has full profiles. The privacy policy lists the fields.

The first version followed LinkedIn, with a cover image behind the photo, an Open to box and education. The project owner then chose the product page's design for profiles too and dropped those three parts: migration `20260925090000_simpler_profiles.sql` removes their columns and the education rows, and renames the roles table to `profile_experience`. A profile now opens with the maker's key figures across their products, the way a product page opens with its own. No cover images were left in local storage.

## Messages 2026-09-24

Makers can write to each other. Send message is on maker profiles and product pages; visitors sign in first and continue in the conversation. Messages arrive live: the header shows an unread count, the inbox lists conversations with the latest message, and replies appear in an open conversation without a reload. Makers can block each other, which stops messages in both directions, and limits stop one account from flooding others. Only the two makers can read a conversation; deleting either account deletes it for both. The privacy policy describes this.

On phones, the signed-in header now shows Messages, Dashboard and Submit SaaS as icons. With the Messages link it would otherwise have overflowed at 360-375 px, and it already overflowed at 320 px.

## Product deletion 2026-09-24

Makers can delete a single product at the bottom of its editor by typing its name. The product page, its logo, its Stripe connection with the stored key and its verification history go at once, the product leaves the leaderboard, and the Stripe account can verify another product. A logo that the profile photo or another product also uses is kept. Deletion is allowed by a new RLS policy for the owner (migration `20260924210000_saas_deletion.sql`), and foreign keys remove everything that belongs to the product.

## Account deletion and a privacy policy 2026-09-24

- Makers can delete their account under Maker profile → Delete account, confirmed with their password. Their profile, products, images, Stripe keys, verification history and sign-in records are removed at once, their products leave the leaderboard, and they are signed out to a confirmation page. The database requires a password sign-in from the last five minutes, so a stolen session token alone cannot delete an account (see ARCHITECTURE).
- A privacy policy at `/privacy`, linked from the footer, sign-up, the Stripe connection and the delete section. It is written from what the code actually stores and reads. It is a draft until the operator's name and contact address are set in `src/lib/legal.ts`.
- The dark theme's destructive buttons had white text on a light red (2.9:1). They now use dark text (5.7:1) through a new `--destructive-foreground` token.
- The "How it works" page now lists the Invoices permission and says that month-end history and growth are public when MRR is shared.

## Local-only Supabase 2026-09-24

The project owner decided that Supabase runs locally for this project, not on Supabase Cloud. `npm run dev` now starts the local Docker stack when needed and points `.env.local` at it, the hosted check script was removed, and the sign-in pages link to the local Mailpit inbox. A sign-up that "never sent an email" was the expected local behavior: the message was waiting in Mailpit. A start right after a stop can fail when a container misses its health check; `npm run db:start` and `db:restart` then retry once and show the CLI error lines, never the keys.

Real email can now be turned on per machine through `supabase/.env.local` (for example Gmail with an app password), without changing the committed config or CI. The mechanism was verified against the installed CLI with a fake SMTP host: overrides reach the Auth container, a missing password falls back to Mailpit, `--mailpit` forces the inbox, and the browser tests refuse to run during real delivery. Actual delivery through Gmail was not tested, because it needs the owner's app password.

The earlier hosted project (`qvvqkskyukqoleuivdfw`, eu-central-1) is no longer used by the code. It was empty when it was disconnected (no users, profiles, SaaS or images) and still exists in the Supabase account, where the owner can pause or delete it.

## Remaining setup

The website is not deployed. Production needs a decision on where Supabase runs: self-hosted (Docker on a server the team operates, with backups, upgrades and monitoring) or Supabase Cloud. It also needs an SMTP provider for the Auth and notification emails, and matching Auth redirect URLs.

## Known issues and next steps

Before a public launch:

1. Verify Stripe verification once against the real Stripe API with a test-mode restricted key (see above).
2. Legal pages. The privacy policy and the terms are drafts: set the operator's name and contact address in `src/lib/legal.ts`, name the hosting, database and email providers once they are chosen (and any transfers outside the EU/EEA), and have both reviewed, including the age limit, liability and governing law, which the terms leave out. The contact address is also where reports from people without an account and appeals go.
3. Moderation follow-ups. Reports, decisions, their emails and product limits exist (see above). Still missing: a retention period for closed reports, and a way for admins to remove a single message.
4. Production Auth settings: the email templates in `supabase/templates` with their subjects, the site URL, and `https://<domain>/auth/confirm` as an allowed redirect URL. Without the redirect URL, links fall back to the site URL and stop working.
5. Security headers are in place (see below and ARCHITECTURE). Check them once on the production domain, for example with securityheaders.com, since a proxy or CDN in front of the app can change or drop headers.
6. Production hosting: where Supabase runs (self-hosted or Cloud), SMTP for Auth and for notification emails (`SMTP_*` and `EMAIL_FROM`, with SPF, DKIM and DMARC for the sender's domain), Auth URLs, a deployment target for the app, a secrets store for `SUPABASE_SECRET_KEY`, `STRIPE_KEY_ENCRYPTION_KEY`, `CRON_SECRET` and `SMTP_PASS`, a daily scheduler for `POST /api/stripe/sync`, and one that calls `POST /api/email/send` every minute.

Product and quality:

7. One Stripe account verifies one product. Makers who sell several products from one account need a per-product filter (Stripe product ids) to split revenue.
8. Only Stripe is supported. Paddle, Lemon Squeezy and others are not.
9. Encryption key rotation: stored keys carry a version prefix, but there is no re-encryption job yet.
10. SEO follow-ups: structured data (JSON-LD) for products, and submitting the sitemap to search engines once the site is live.
11. Old images stay in storage after replacement or removal, until the account is deleted.
12. All routes are dynamic with `no-store`. Public pages could be cached once traffic grows, with private data kept separate. The nonce-based Content Security Policy needs a fresh render per request, so caching pages would mean moving to hashes or the experimental SRI support first.
13. Image signature validation in `src/lib/upload.ts` has no unit tests. Vitest can now import server-only modules, so this is straightforward.
14. Realtime keeps its message event rows, which hold ids only, for a few days.
15. Notification emails have no one-click unsubscribe (`List-Unsubscribe`, RFC 8058): turning them off takes a sign-in. Large senders to Gmail and Yahoo need it, so add it before volumes grow. The emails are in English only.
16. Demo products retire themselves at 12 ranked products, but their code stays. Remove it once the directory has grown; ARCHITECTURE lists the parts.
17. The browser tests run against `next dev`, which compiles routes on demand. Once, it answered Page not found for the product form in the registration test, and the failure did not repeat. Failed tests now keep a trace; if it happens again, the trace shows the address and the requests. Running the browser tests against a production build (`next build` and `next start`) would remove the dev server's compile timing from the tests.
