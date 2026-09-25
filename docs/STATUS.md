# Implementation status

Updated 2026-09-25 with features from a competitor review (among them Paddle, Polar and Dodo Payments), a review before release, demo products, email notifications, readable addresses and sharing cards, a Content Security Policy, email links that work on any device, and reports with an admin panel. The project was reviewed and handed over 2026-09-24; the first release was built 2026-09-12 and committed on the `development` branch.

## Implemented

The first release includes accounts, email confirmation and recovery, public maker profiles, multiple editable SaaS per owner, profile/logo uploads, SaaS and maker pages, category/name filtering, newest arrivals, and a USD MRR leaderboard. Each optional metric has a sharing control. Private verification history and the current public projection are separate and protected by RLS. No demo data is displayed as real activity.

Makers can message each other privately (see Messages below), and report products, profiles and messages to the admins, who decide in an admin panel (see Reports and moderation below). They get emails about unread messages and about decisions (see Email notifications below). Other forms of connection, such as following or contact lists, are not implemented.

## Confirmation panel and username limit 2026-09-26

At the project owner's request, a finished sign-up replaces the form with a Check your inbox panel: the address the confirmation link went to, that the account must be confirmed before signing in, what to do when nothing arrives, and a link to sign in. And a username can now change once every 30 days, with the first change free (migration `20260926040000_username_changes.sql`, applied to production before the code). The time of the last change is kept in a private table rather than on the public profile, and account deletion removes it; the privacy policy says so. The profile form shows a locked username read-only, with the days left.

## Usernames and even auth forms 2026-09-26

At the project owner's request, sign-up now asks for a username in a second step: after Create account checks the email address, password and terms, one field asks for the username, and Continue creates the account and sends the confirmation email. The username becomes the profile's name and its address, `/users/<username>`, and the profile shows it as @username under the name in smaller, grey text. Users change both on their profile; the name no longer changes the address. Existing profiles keep their slug as username. The migration `20260926030000_usernames.sql` was applied to production on 2026-09-26, a few minutes after the code went live; no one signed up in between. The owner's production profile is still named Harbor maker, with the username harbor-maker; both can be changed on the profile.

The sign-in, sign-up and reset forms now line up to the pixel at 390 and 1440 px: the sign-up description wrapped onto two lines and pushed its fields 24 px down, and the Forgot password link made the password label 3 px lower on sign-in. The required-field star no longer makes its label row taller either. The username field of the second step sits where the email field was, and takes the focus.

## Sign-up checks 2026-09-26

At the project owner's request, passwords need at least 6 characters instead of 12 (`PASSWORD_MIN_LENGTH` in `src/lib/domain.ts`, the same as `minimum_password_length` in `supabase/config.toml`). NIST recommends at least 8. Production Auth keeps refusing shorter passwords than 12 until `npm run auth:production` pushes the new minimum. On a site served over https, sign-up now also checks in DNS that the address's domain can receive email (`src/lib/email-domain.ts`): a domain that does not exist, such as gmail.con, or that publishes a null MX, such as example.com, is refused with a request to check for typos. A domain without MX records passes when it has an address, and a DNS failure never blocks sign-up. A misspelled domain that really exists still passes; the confirmation email remains the proof. Locally and in the browser tests the check is off, since they use reserved test domains. The required fields of the product form now carry a red star.

## Terms of Service 2026-09-25

At the project owner's request, sign-up now has a required box: "I agree to the Terms of Service. I have read the Privacy Policy." The server refuses a sign-up without it, and the accepted version and time are recorded per account in `private.terms_acceptances` (migration `20260926020000_terms_acceptance.sql`, applied to production 2026-09-26), which account deletion removes; the privacy policy says so. The owner's production account predates the box and has no record. The browser test checks the box, the server's refusal and the recorded version; the whole path was also checked locally through Auth.

The owner wants the terms to put the risk on the user, like TrustMRR's (read 2026-09-25), and no age limit. The page is now Terms of Service, without an age limit, and adds: users are solely responsible for what they publish and for the keys they provide, which we do not verify; figures and everything else are information only, not financial or investment advice; dealings between users are theirs alone; the site is provided as is, without warranties; no liability for any direct or indirect loss, to the maximum extent permitted by law, with a sentence that this does not cover what the law does not allow (such as intent or gross negligence); users indemnify the operator; the site and the terms may change at any time, and continued use accepts new terms; content may be removed and accounts suspended at our discretion; bulk copying is not allowed; Swedish law and courts unless mandatory law says otherwise. The moderation and appeal description stays, since the Digital Services Act requires a statement of reasons. The privacy policy adds TrustMRR's disclosures (when the law requires it, to protect the site or its users, or to a buyer or successor) with their legal bases, and that no online service can guarantee complete security. The "maximum extent permitted by law" wording keeps the limits valid where Swedish and EU consumer law would void a blanket exclusion; that needs a legal review before launch.

## Vercel and Resend 2026-09-25

At the project owner's request, the app will run on Vercel and send email through Resend. `vercel.json` puts the functions in Frankfurt and turns off deployments of `development`. To start on Vercel's free Hobby plan, whose scheduled jobs run only once a day, the jobs run from the database instead: pg_cron calls the email route every minute and the revenue sync every ten minutes through pg_net (migration `20260926010000_scheduled_jobs.sql`, see ARCHITECTURE). The site address and secret are in Vault, set only in production, so the jobs do nothing locally and in CI. `scheduling.test.sql` covers the schedules, the request and the privileges, and the whole path was run locally against the dev server with a wrong secret: the job ran each minute and the app answered 401. Hobby allows only non-commercial use; move to Pro once the site earns money. `npm run auth:production` pushes the production Auth settings with Resend as SMTP; it takes the API key hidden and asks before pushing. It refuses to run outside a terminal; the interactive part and the push itself have not run yet, since they need the owner's Resend key. The privacy policy names Vercel, Supabase and Resend, with their regions. The accounts, API keys, DNS records and Vercel settings are the owner's steps (README, Production).

Linking the production project had a side effect on this machine: `supabase link` pins production's service versions in `supabase/.temp`, and the next local start ran Storage v1.77.5 instead of the CLI's v1.72.1. Its schema migrations dropped the unique index `bucketid_objname` that v1.72.1 upserts against, and image uploads failed locally with 42P10 (found by the browser test). The index was recreated in the local database, and `npm run db:start` and `db:restart` now remove the pins before starting (`scripts/local-supabase.mjs`). Production runs newer Storage and Auth versions than the local stack and PostgREST v14.5 against v16.2 locally; the tests run on the CLI's versions, as CI does.

## Production Supabase 2026-09-25

At the project owner's request, production uses managed Supabase: the project `vgwgeennghaqpvfsqewq` ("The SaaS Harbor") in the owner's Auxron organization, in Frankfurt (eu-central-1), on the free plan for now. Development and tests stay on the local stack. All 20 migrations were applied with `supabase db push --linked`, and `supabase db diff --linked` reports no changes. The grants, column privileges, functions and their privileges, RLS policies and the storage bucket were compared with the local database and match; only Supabase's own storage tables differ between the versions. The pgTAP suites cannot run against the project (the CLI's temporary login role does not find the pgTAP functions), so that comparison stands in for them. Supabase's advisors report only what is by design (security definer functions for the API and private tables without policies, both covered by `privileges.test.sql`) and informational notes on an empty database (unused indexes, composite foreign keys covered by their leading column, two log tables without a primary key).

Production Auth settings are in `[remotes.production]` in `supabase/config.toml` but not yet applied: Supabase refuses the custom email templates on the free plan until a custom SMTP provider is set, and `config push` then fails as a whole, so nothing changed. The privacy policy now names Supabase and its region. The domain `thesaasharbor.com` is the owner's; where the app runs is still open.

## New logo 2026-09-25

At the project owner's request, the logo is a lighthouse whose beam lights a rising bar chart above the sea, with the name set in two lines, "The" above "SaaS Harbor". It is a vector drawing of the owner's sketch in `src/lib/logo.ts`, with its own light and dark colors, and replaces the old mark in the header, footer, sign-in pages, favicon, sharing images and badge. The favicon switches to the dark colors when the browser prefers dark.

## Users and founders 2026-09-25

At the project owner's request, the site calls people users, and a user who owns a product its founder. Product pages, cards, sharing cards, the Markdown versions and the admin views of products say founder; profiles, messages, reports, settings, the privacy policy and the terms say user or profile. Profiles moved from `/makers/<slug>` to `/users/<slug>`, and the old addresses redirect permanently. Messages from the database that named a maker say user or profile (migration `20260926000000_user_wording.sql`). Code, the database and the docs keep the word maker. On the way, a flaw in the hourly sync was found and fixed: `claim_due_connections` could claim more connections than asked, since PostgreSQL may run an `IN` subquery with `LIMIT` and `FOR UPDATE SKIP LOCKED` more than once; a materialized CTE picks them once (migration `20260926000100_claim_due_once.sql`).

## Features from the competitor review 2026-09-25

The project owner compared the site with TrustMRR and chose six things it does well to build here: a link that creates the Stripe key, an embeddable badge, pages for search engines and AI assistants, a statistics page, more payment providers (Paddle, Polar and Dodo Payments, one per product), and hourly verification. All six are built. What TrustMRR does less well waits for later updates.

- **Stripe key link.** The product editor links to Stripe's form for a new restricted key with the name and Read for Subscriptions, Invoices, Coupons and Prices filled in, so makers no longer pick the permissions themselves. Stripe does not document these parameters, so the editor still names the permissions to check. The ids were checked against Stripe's permission reference (Prices use `plan_read`); whether the form fills them in is part of the first test against the real Stripe API (known issue 1).
- **Hourly verification.** Every connection is verified about every hour instead of daily. The scheduler calls `POST /api/revenue/sync` every ten minutes; each run claims the connections not verified or checked for 55 minutes, oldest first, three at a time, and claims nothing new after four minutes. A scheduled verification reads only what MRR needs and carries over the history and 30-day growth read less than 23 hours ago, so each account's large reads (invoices, transactions, orders from 25 months) happen about once a day; Refresh now and a new key still read everything. A product keeps one snapshot per day: a re-verification replaces the day's snapshot, and a new key adds one. The copy on the site and the privacy policy say so. pgTAP covers replacing the day's snapshot, a new day, a new key, the projection after an update, and claiming due connections (order, limit, no second claim, not for makers); unit tests cover reading without the history for all four providers and when a history is carried over. The browser tests never call the authorized sync, since it would verify every due connection in the local database, including real ones.
- **Payment providers.** Paddle, Polar and Dodo Payments verify revenue as well as Stripe, one provider per product, chosen in the product editor with steps for a key that can only read. A new key may switch a product to another provider. MRR has the same definition for all four; how each provider's data is read is in ARCHITECTURE: Paddle values each subscription by its latest full charge, because it bills in local prices and currencies, and Polar and Dodo Payments take tax out where amounts include it. Paddle and Polar have a month-end history and 30-day growth from their paid charges; Dodo Payments has none, since its payments do not say which period they cover. Product pages and the Markdown versions name the provider. The Stripe-only names in the database, the code and the scheduled route became provider-neutral (`revenue_connections`, `record_revenue_verification`, `begin_revenue_check`, `/api/revenue/sync`, `npm run revenue:sync`, `REVENUE_ALLOW_TEST_KEYS`); `STRIPE_KEY_ENCRYPTION_KEY` keeps its name, and existing Stripe claims keep their hashes. The research behind each client used the providers' current API references and OpenAPI specs, and the fake server copies their documented response shapes. pgTAP covers providers on connections, snapshots and the projection, switching and refused re-verifications; unit tests cover each provider's keys, MRR, history and edge cases; the full read path of all four runs against the fake server; a browser test connects Paddle, switches to Polar and then Dodo Payments, and checks the figures, the notes and the stored provider. The provider choice was checked at 390 px and 1440 px in both themes. None of the three new providers has been tried against a real account (known issue 1).
- **Statistics.** `/stats` adds up the leaderboard's figures, computed in the database by `directory_stats()`: combined and median MRR, paying customers, MRR buckets, the change over 30 days, figures by category and by time since launch, the combined month-end history and the fastest growing products, with a sharing card. Below five ranked products it says so instead. pgTAP checks every figure against fixtures, including private and stale products; unit tests cover reading the result and the labels; a browser test adds five ranked products, compares the figures with the leaderboard, and runs Axe in both themes and the 390 px check. The page was checked at 390 px and 1440 px in both themes.
- **Search engines and AI assistants.** A page per category with its ranked products and the rest A to Z, and an overview of the categories; JSON-LD on the product, maker, category and home pages; product titles with shared verified MRR; `/llms.txt` with the site's description, categories and the top 50; and Markdown versions of every product and maker page at `.md`, which escape what makers wrote. Demo products stay out of all of it, and empty categories are `noindex` and out of the sitemap. pgTAP covers the category counts (hidden products, suspended makers and stale figures); unit tests cover the slugs, the structured data, the Markdown and its escaping; the browser tests cover the pages, redirects, headers, the sitemap, robots.txt and a hidden product, and the new pages pass Axe in both themes and have no horizontal scroll at 390 px. The category pages were checked at 390 px and 1440 px in both themes.
- **Badge.** `/saas/<slug>/badge.svg` is an SVG badge for makers' own sites, in a light and a dark theme, linked to the product page. It shows the verified MRR only while the product shares it and the verification is fresh, and otherwise says Listed on The SaaS Harbor. Hidden products have none, and old addresses redirect. Caches may keep it for ten minutes, which the privacy policy says. The product editor shows a preview and the HTML and Markdown to paste. Unit tests cover the drawing, text widths and escaping; the browser tests cover the headers, private and shared figures, the dark theme, redirects, a hidden product and the editor's code. The editor section was checked at 390 px and 1440 px in both themes.

## Release review 2026-09-25

The project owner asked for an inspection before release: security, bugs, and whether everything works. Three reviews (the database, the application's security, and functional bugs) were checked against the code and the local database. A production build was inspected in the browser, its headers checked, and the dependencies and the whole git history searched for known flaws and committed secrets. Every confirmed defect below was fixed with a test.

- **Critical, dependency:** Next.js 16.3.5 had a remote code execution flaw in `next/og` ImageResponse (CVE-2026-94545), which the sharing cards use with text makers write. `npm audit` did not report it yet. Next.js is now 16.3.6.
- **Database** (migration `20260925190000_release_hardening.sql`):
  - Renaming a product could reserve any number of slugs. A slug in use now wins over a redirect, and a product keeps five earlier slugs.
  - Deleting and adding a product reset the daily limit. Additions are now counted in their own log.
  - Parallel requests could exceed the message and report limits. They now count one at a time.
  - An image path could climb into another folder with `..`.
  - `send_message` told a suspended recipient apart from a deleted one.
  - New objects in `public` were open to the API roles by default, and the public views held write privileges. Both are closed, and a new test lists every privilege.
  - Account deletion left the maker's id in other makers' queued emails and live-update events.
- **Application:**
  - Stripe checks were not limited, and failed checks never were. Now a product refreshes at most every five minutes, and a maker starts at most 20 checks an hour.
  - Database and internal error messages reached makers.
  - Session cookies lacked `Secure`, and any signed-in session could set a new password. Cookies are `Secure` over https, a new password needs a fresh reset link, and other sessions end.
  - Images could unpack to huge sizes. They are now limited to 4096 pixels per side.
  - The proxy's redirects from ids could be cached forever.
  - The CSP blocked the script on the global error page.
  - Stripe and exchange-rate overrides could use http in production.
- **Bugs:**
  - A message email never came after the recipient had read the previous message without replying.
  - Accounts with more than 20,000 invoices failed verification entirely. History is now skipped with a note, and the note names the permission that is missing.
  - Multi-currency prices were valued in the price's default currency.
  - A repeated search parameter crashed the list pages, and a page past the last showed an error.
  - The category reset after a failed save.
  - Prorations were spread over an average month instead of their billing period.
  - Weekly prices differed between the MRR and the history.
  - The chart could show $2.50 steps.
  - A long disconnection could leave gaps in an open conversation, and a reconnect did not catch up.
  - Long names without spaces overflowed on phones.
  - Launch dates accepted year 0 and the future.
  - Roles "this month" were refused east of UTC.
  - The sitemap and the daily Stripe sync stopped at 1,000 rows.
  - Browse was titled "Discover".

Decisions the owner made on 2026-09-25: the first two wait until later (known issues 13 and 18), and the production Auth settings in the third are agreed and apply when production is set up (known issue 4).

1. **Faked revenue.** A maker can create subscriptions in their own live Stripe account that are never paid. Sent but unpaid invoices keep a subscription active, and invoices marked paid outside Stripe count as paid, so they show as verified MRR. Counting only subscriptions whose latest invoice was paid by an actual payment would close this. It changes the MRR definition, since past-due and unpaid invoiced subscriptions would no longer count.
2. **Sign-in abuse.** Sign-in, sign-up and password reset run on the server, so Supabase Auth sees the server's address. Its limits per address then apply to all users together or not at all, depending on the host. A CAPTCHA on these forms (for example Cloudflare Turnstile or hCaptcha) is the usual fix. It needs an account with the provider and a line in the CSP.
3. **Production Auth settings** (known issue 4). Allow at least 60 seconds between emails to one address (`max_frequency`; it is 1 second locally for the tests), turn `secure_password_change` on, and set email rate limits for the SMTP provider.

Accepted and documented:

- A maker may delete a hidden product and add it again. The right to delete comes first, and the daily limit, reports and suspension still apply.
- Makers can upload files straight to their own storage folder through the Storage API, which checks only the type and size.
- Missing pages answer with status 200 and `noindex`, because pages stream under `loading.tsx`.
- A maker's name appears in message email subjects.
- A confirmation link that an attacker sends can sign the reader into the attacker's account.

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
- Terms at `/terms`, linked from the footer, sign-up and the report form. The privacy policy covers reports, decisions and what admins see. Admins are granted with `npm run admin` (see README); the demo data has an admin and four reports.
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

After the features from the competitor review, on the same day:

- `npm run check`: Prettier, ESLint with zero warnings, TypeScript, and 199 unit tests in 16 files, now also the badge, the category addresses, the structured data, the Markdown and its escaping, the statistics result and labels, each new provider's keys, MRR, history and edge cases, the full read path of all four providers against the fake server, and reading without the history.
- `npm run build`: Next.js 16.3.6 production build, with the new routes (the badge, the category pages, llms.txt, the Markdown versions, the statistics page and card, `/api/revenue/sync`).
- `npm run test:db`: 327 pgTAP assertions in ten suites (`access` 113, `moderation` 94, `notifications` 32, `slugs` 27, `statistics` 14, `hardening` 13, `verification` 13, `providers` 9, `discovery` 6, `privileges` 6). `supabase db diff` reports no drift.
- `npm run test:e2e`: 12 Chromium tests, the new ones for the statistics page and for Paddle, Polar and Dodo Payments, and new checks in the others for the key link, the badge, the pages for search engines and AI assistants, and a hidden product.

Before those features:

- `npm run check`: Prettier, ESLint with zero warnings, TypeScript, 142 unit tests: Stripe MRR, invoice history and prorations, keys and encryption, chart models, message threads, profile dates and input, sign-in continuation, report and decision input, the Content Security Policy, the notification emails, the demo products and how they fill a list, image formats and sizes, and the full Stripe read path against the fake Stripe server, multi-currency prices included.
- `npm run build`: Next.js 16.3.6 production build. The production build was also run locally and checked in the browser: security headers, robots, the sitemap, the sharing card, every public page without console errors, and responses under 0.1 seconds.
- `npm run test:db`: 285 pgTAP assertions in six suites (`access` 113, `moderation` 94, `slugs` 27, `notifications` 32, `hardening` 13, `privileges` 6). Two deliberately weakened policies (product visibility and report visibility) were each caught by the moderation suite before being restored. The notifications suite failed on a version that counted one unread message in two emails, and on the version that sent no email after a read without a reply. `supabase db diff` reports no drift between the local database and the migrations, and `supabase db lint` reports no errors.
- `npm run test:e2e`: 10 Chromium integration tests with Axe scans in both themes (including the revenue charts, the privacy policy and the terms, the delete sections, messaging, personal profiles, the report pages, every admin page, the notices makers see, the email settings and the demo products and their pages), against local Supabase, local Realtime, Mailpit and a fake Stripe API, passing twice in a row after the release review. Before the review, one run failed once in the registration test, where the test server answered Page not found for the new product form; it did not repeat in any run since. Failed tests now keep a Playwright trace (see known issue 17).
- The admin and report pages were checked at 390 px and 1440 px in both themes, and with touch emulation for the message Report link.
- CI ran on GitHub for the first time on 2026-09-25. The checks and the build passed, and the browser tests failed: the workflow started Supabase without Realtime, which the messaging test needs to receive messages live. The list of left-out services was older than messaging. The workflow now starts Realtime, uses version 7 of the GitHub actions (Node.js 24, as GitHub now requires), and runs on Ubuntu 24.04 instead of `ubuntu-latest`, which moves to Ubuntu 26 from 2026-10-19. The database and browser tests passed locally with exactly the services the workflow starts, and failed as on GitHub without Realtime. The next run on GitHub passed both jobs, without warnings.

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

The earlier hosted project (`qvvqkskyukqoleuivdfw`, eu-central-1) is no longer used by the code. It was empty when it was disconnected (no users, profiles, SaaS or images), and on 2026-09-25 it was no longer in the owner's Supabase organization.

## Remaining setup

The site is live at https://thesaasharbor.com since 2026-09-25: Vercel (Hobby, Frankfurt) builds `main`, `www` redirects to the domain without www, and Supabase Cloud and Resend are connected. The first two builds failed because the Vercel project had the framework preset Other; `vercel.json` now sets Next.js. Both scheduled jobs answer 200 from the database (the email job every minute, the revenue sync every ten minutes). `STRIPE_KEY_ENCRYPTION_KEY` was replaced before any provider key was stored, so the owner holds a verified copy. The production Auth settings are applied with `npm run auth:production`: the owner's confirmation email arrived through Resend with the project's subject. The owner's account is the first admin in production (`public.set_admin`). Still to do: Supabase Pro before launch (Vercel Pro once the site earns money).

## Known issues and next steps

Before a public launch:

1. Verify revenue verification once against each provider's real API with a test account: Stripe with a test-mode restricted key (see above), checking that the editor's key link opens Stripe's form with the four permissions filled in; Paddle with a sandbox key (the totals of transaction lines, and 403 answers for a missing permission); Polar with a sandbox token (the `Polar-Version: 2026-10` header, which becomes Polar's current version on 1 October, whether a subscription's `amount` includes VAT for tax-inclusive prices, and order items' periods); and Dodo Payments with a test key whose write access is off (whether `recurring_pre_tax_amount` is the charge after discounts and quantity, what `tax_inclusive` means for it, whether keys carry a prefix, and the error bodies). The documentation leaves these points open, and the code follows the most literal reading.
2. Legal pages. The operator is named as The SaaS Harbor Team (2026-09-25, at the owner's request). Still open: a contact address in `src/lib/legal.ts`, which the GDPR expects for privacy requests and the terms need for reports from people without an account and appeals (until then both pages and every place that points to it say it will be published); the legal identity behind the name, since a team name is not a legal person; the transfer safeguards for Vercel and Resend; and a legal review of both pages.
3. Moderation follow-ups. Reports, decisions, their emails and product limits exist (see above). Still missing: a retention period for closed reports, and a way for admins to remove a single message.
4. Production Auth settings: all of them are in `supabase/config.toml` with `[remotes.production]` (the email templates and subjects, `https://thesaasharbor.com` as site URL and its `/auth/confirm` as redirect URL, 60 seconds between emails to one address, `secure_password_change`, a 6-character minimum password) and were applied with `npm run auth:production` on 2026-09-25 (see README, Production). Still open: email rate limits to match Resend's plan and the CAPTCHA decision (see Release review).
5. Security headers are in place (see below and ARCHITECTURE). Check them once on the production domain, for example with securityheaders.com, since a proxy or CDN in front of the app can change or drop headers.
6. Production hosting: Vercel (Hobby to start, Pro once the site earns money), Supabase Cloud (Pro before launch) and Resend, set up as in README, Production, with SPF, DKIM and DMARC for `thesaasharbor.com`. After the first deployment and the Vault secrets, check that both scheduled jobs answer 200 (README, Scheduled jobs).

Product and quality:

7. One provider account verifies one product, and a product has one provider. Makers who sell several products from one account need a per-product filter (product ids, or Dodo's brands) to split revenue, and those who sell one product through two providers need connections added together.
8. Stripe, Paddle, Polar and Dodo Payments are supported. Lemon Squeezy was left out on purpose: its API keys always have full access. Others, such as RevenueCat or Chargebee, are not supported. Requests to a provider are spaced out per server process only; with several app instances, Paddle's limit per IP address is shared between them.
9. Encryption key rotation: stored keys carry a version prefix, but there is no re-encryption job yet.
10. SEO follow-ups: once the site is live, submit the sitemap to search engines and check the structured data with Google's Rich Results Test.
11. Old images stay in storage after replacement or removal, until the account is deleted. There is no limit on how many files a maker stores in their folder; a cleanup of unreferenced files should come before a per-maker limit, so replacing a logo never fills it up.
12. All routes are dynamic with `no-store`. Public pages could be cached once traffic grows, with private data kept separate. The nonce-based Content Security Policy needs a fresh render per request, so caching pages would mean moving to hashes or the experimental SRI support first.
13. Faked revenue through the maker's own Stripe account (see Release review, point 1). Postponed by the owner. Paddle already values subscriptions by their paid charges; Polar and Dodo Payments count subscriptions as the provider reports them.
14. Realtime keeps its message event rows, which hold ids only, for a few days.
15. Notification emails have no one-click unsubscribe (`List-Unsubscribe`, RFC 8058): turning them off takes a sign-in. Large senders to Gmail and Yahoo need it, so add it before volumes grow. The emails are in English only.
16. Demo products retire themselves at 12 ranked products, but their code stays. Remove it once the directory has grown; ARCHITECTURE lists the parts.
17. The browser tests run against `next dev`, which compiles routes on demand. Once, it answered Page not found for the product form in the registration test, and the failure did not repeat. Failed tests now keep a trace; if it happens again, the trace shows the address and the requests. Running the browser tests against a production build (`next build` and `next start`) would remove the dev server's compile timing from the tests.
18. No CAPTCHA on sign-in, sign-up and password reset (see Release review, point 2). Postponed by the owner; until then the Auth limits per address protect little when the host shows Auth the server's address.
