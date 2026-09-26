# The SaaS Harbor

A focused, responsive home for independent SaaS: public maker profiles, product discovery, and a leaderboard of monthly recurring revenue verified through each product's payment provider: Stripe, Paddle, Polar or Dodo Payments.

## Included

- Email/password registration, email confirmation, sign-in, sign-out, and password recovery.
- Personal maker profiles laid out like product pages: photo, headline, location, key figures across the maker's products, About, products, experience, skills, and links to a website, LinkedIn, GitHub and X.
- Multiple SaaS profiles per maker, with a logo, pitch, description, category, website and tech stack.
- Revenue verified through a read-only key to the product's payment provider (Stripe, Paddle, Polar or Dodo Payments, one per product): MRR and paying customers are read from the provider, never typed in, and re-verified every hour.
- Optional domain verification: a founder adds a DNS TXT record with a code for the product to the website's domain, and the product page's details then show the domain as Verified instead of Not verified. The record is looked up again every day; after three days without it, or when the website moves to another domain, the mark goes.
- A screenshot of each product's landing page on its page, taken by the app with a headless browser when the product is listed or its website changes, and again every 30 days. Founders can ask for a new one or turn it off.
- Verified MRR, paying customers and launch date, each with an independent public-sharing choice. Products without a connected provider are listed but not ranked.
- Private verification history, a public leaderboard, category, technology and name filters, and newest arrivals.
- Readable addresses such as `/saas/querybird` and `/users/tomas-rivera`, with old links redirected, and sharing cards, canonical links and a sitemap for search engines and social networks.
- Pages for search engines and AI assistants: a page per category (`/categories/<slug>`) and per technology (`/tech/<slug>`, from the tech stacks founders list, with an overview at `/tech`) with its ranked products first, structured data (JSON-LD) on product, maker, category and home pages, titles that carry shared verified MRR, `/llms.txt` with the current top 50, and a Markdown version of every product and maker page at the same address with `.md` added.
- A statistics page (`/stats`) that adds up the leaderboard's figures: combined and median MRR, paying customers, how MRR is spread, the change over 30 days, the figures by category and by time since launch, the combined month-end history and the fastest growing products, with its own sharing card. It shows figures once five products share verified MRR.
- A badge makers embed on their own site (`/saas/<slug>/badge.svg`, light or dark), which shows the verified MRR while it is shared and links to the product page. The product editor gives the HTML and Markdown to paste.
- Demo products while the directory is new: until 12 real products share verified MRR, the leaderboard, Browse and New arrivals fill their first page with made-up products after the real ones. On the leaderboard they sit under a Demo MRR column without a rank or tag; cards and their own pages carry a Demo tag. They are never ranked or called verified, have their own pages under `/demo` that search engines skip, and disappear as real products join. `DEMO_PRODUCTS=off` hides them at once.
- Private messages between makers: Send message on maker profiles and product pages, live delivery and unread counts, blocking, and limits against spam.
- Email notifications: one email per unread conversation, which names the sender but never contains the message, a note to admins about open reports, and emails to makers about decisions on their products or account and to reporters about the outcome. Makers choose under Dashboard → Email settings.
- Reports and moderation: signed-in makers report a product, a profile or a message they received, and follow the outcome under Dashboard → Your reports. An admin panel at `/admin` lists reports, products, accounts and every decision. Admins hide products and suspend accounts with a reason and an explanation the maker sees in their dashboard. An account lists at most 20 products and adds at most 5 a day.
- Deletion by the maker: a single product, confirmed by typing its name, or the whole account, confirmed with the password. Everything that belongs to it goes, including images, provider keys and verification history, and for the account also the sign-in records.
- A home page for founders: a compact header invites every SaaS to list for free, verified or not, with a button straight to sign-up and a short list of what a listing gives; the leaderboard follows at once. A new account lands on the product form once its email is confirmed.
- A followed link to the product's website while its revenue is verified, which also shows founders the visits we send them.
- Page views for founders: a product's page shows its founder, and no one else, how often it was viewed in the last 7 days, the last 30 days and all time. Their own views, bots and admins are not counted.
- Feedback: a Feedback button on every page and a Send feedback link in the footer let signed-in users report bugs and errors or send suggestions, which admins read and mark handled at `/admin/feedback`.
- Site statistics, counted without cookies: an Analytics page in the admin panel (`/admin/analytics`) where every card has its own period (24 hours, 7 or 30 days, 12 months or all time) and changes it without reloading. It shows visitors, visits, page views, pages per visit, bounce rate and visit length against the period before, with a chart; the last 30 minutes live; pages, entry and exit pages; channels, sources, referring sites and every campaign tag; countries, cities and languages; devices, browsers and systems with their versions; visitors by weekday and hour; pages per visit and visit length; clicks on links to other sites; and sign-ups, products, provider connections and messages. It comes from our own database. Vercel Web Analytics and Speed Insights (page load times) also run in production, read in the Vercel dashboard. Bots, automated browsers, admin pages and signed-in admins are left out, and addresses keep only their campaign tags.
- A privacy policy at `/privacy` and terms at `/terms` (the operator is The SaaS Harbor Team in `src/lib/legal.ts`; the contact address is still to come).
- Supabase RLS, owner checks in Server Actions, owner-scoped image uploads, and a Content Security Policy with a fresh nonce per request.
- Light and dark themes.

Sales, escrow, company profiles and payment providers other than Stripe, Paddle, Polar and Dodo Payments are outside this release.

## Run locally

Requires Node.js 22.14 or later (see `.nvmrc`), npm and Docker Desktop. The Chromium build for Vercel (`@sparticuz/chromium`, an optional dependency) installs only on Node.js 22.17 or later. Older versions skip it, which is fine locally: screenshots there use Playwright's Chromium, and `next.config.ts` keeps the build from warning about the missing package. Dependencies have exact versions and a lockfile, and `.npmrc` keeps new installs exact.

Development and tests run the whole backend locally: Supabase (PostgreSQL, Auth, Storage) runs in Docker through the Supabase CLI. Production uses Supabase Cloud (see [Production](#production)).

```powershell
npm ci
npm run dev        # starts local Supabase if needed, then http://localhost:3001
npm run db:seed    # optional: 8 fictional makers, 16 SaaS, an admin and a few reports
npm run db:seed -- --remove   # removes those accounts again
```

Before the dev server starts, `npm run dev` runs `scripts/local-env.mjs`. It starts the local Supabase stack when it is not running (the first start downloads Docker images) and writes the local URLs and public key into `.env.local`. Other lines in `.env.local` are kept. `npm run env:local` does the same without starting the app.

| Local service                        | Address                |
| ------------------------------------ | ---------------------- |
| App                                  | http://localhost:3001  |
| Supabase API                         | http://127.0.0.1:55321 |
| Supabase Studio (tables, users, SQL) | http://127.0.0.1:55323 |
| Mailpit (every email the app sends)  | http://127.0.0.1:55324 |

Auth is Supabase Auth. Locally, confirmation and password reset emails, and the notification emails, never reach a real inbox: Mailpit catches them all, and the sign-in pages link to it. The links open a confirm page in any browser, not only the one you signed up in, and work once. Use `http://localhost:3001` consistently rather than `127.0.0.1:3001`, because the session cookies are tied to the hostname.

### When Docker Desktop does not start

If Docker Desktop reports `initializing Inference manager` and a file in `%LOCALAPPDATA%\Docker\run` that "cannot be accessed by the system", a previous session left sockets behind that Windows will not delete. Quit Docker Desktop, rename that `run` folder (for example to `run-stale`), and start Docker Desktop again; it creates a new one, and the stale folder can be deleted after a restart. Never choose **Reset to factory defaults**: it deletes every container and volume, including this project's local database.

### Real email

Local Auth can deliver email to real inboxes through any SMTP provider. The settings live in `supabase/.env.local`, which is git-ignored and overrides the committed defaults in `supabase/.env` (real email off). For Gmail:

1. Turn on 2-Step Verification for the Google account and create an app password at https://myaccount.google.com/apppasswords.
2. In `supabase/.env.local`, set `HARBOR_SMTP_ENABLED=true`, `HARBOR_SMTP_HOST=smtp.gmail.com`, `HARBOR_SMTP_PORT=587`, your address as `HARBOR_SMTP_USER` and `HARBOR_SMTP_ADMIN_EMAIL`, and the app password as `HARBOR_SMTP_PASS`.
3. Run `npm run db:restart`. It prints where Auth email goes.

Without a password the stack falls back to Mailpit. The links in the emails point at the dev server on this computer (`http://localhost:3001`), so open them on this computer; any browser works. The browser tests need Mailpit and refuse to run while real email is on; `npm run db:restart -- --mailpit` switches back until the next plain restart.

### Notification emails

The app sends its own emails through SMTP, separately from the Auth emails:

- A new message: one email per conversation, five minutes after the first unread message and only if it is still unread, then none until the recipient has read the conversation. It names the sender and links to the conversation, and never contains the message.
- New reports: an email to each admin, at most one an hour, with the number of open reports.
- Decisions: hiding or restoring a product, and suspending or restoring an account, email the maker with the reason and the explanation. Closing a report emails the reporter the outcome. These are always sent.

Makers turn message emails off, and admins report emails, under Dashboard → Email settings. The database queues each email together with what it is about, and the app sends what is due right after the action and whenever `POST /api/email/send` is called with `Authorization: Bearer $CRON_SECRET` (see ARCHITECTURE).

`npm run dev` points `SMTP_HOST` and `SMTP_PORT` in `.env.local` at Mailpit's SMTP port (55325), so notifications land in Mailpit next to the Auth emails. Message emails wait five minutes; `npm run email:send` sends whatever is due through the running dev server, as the production scheduler will. To send them to real inboxes, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` in `.env.local`, which `npm run dev` then keeps; for Gmail, `smtp.gmail.com`, port 587, your address as user and sender, and an app password. The demo accounts' `.test` addresses cannot receive email, so their notifications then bounce. The browser tests always use Mailpit.

### Revenue verification

In a product's editor, the maker chooses the payment provider and creates a key that can only read, following the steps shown:

| Provider      | Key                                     | Access                                                  |
| ------------- | --------------------------------------- | ------------------------------------------------------- |
| Stripe        | Restricted key, `rk_live_`              | Read for Subscriptions, Invoices, Coupons and Prices    |
| Paddle        | API key, `pdl_live_apikey_`             | Read for Subscriptions and Transactions, no expiry date |
| Polar         | Organization access token, `polar_oat_` | organizations:read, subscriptions:read and orders:read  |
| Dodo Payments | API key with write access turned off    | Reads only                                              |

For Stripe, a link opens Stripe's form for a new restricted key with the name and permissions filled in. The link uses live mode; for a test account, create the key under Developers → API keys → Create restricted key in test mode with the same permissions. The key is verified first, then stored encrypted. Paid charges give the product page its chart of MRR at each of the last twelve month-ends and the leaderboard its trend line and 30-day growth; a Stripe key without Invoices access still verifies MRR, just without history, and Dodo Payments products have no history, since Dodo's payments do not say which period they cover. Locally test keys and sandboxes are accepted (`REVENUE_ALLOW_TEST_KEYS=true`: `rk_test_`, `pdl_sdbx_apikey_`, and Polar and Dodo Payments test accounts), so test accounts work end to end. `npm run revenue:sync` re-verifies the connections that are due through the running dev server, as the production scheduler does: each connection about every hour, with the history and 30-day growth read once a day and carried over in between. How each provider's figures are read is in ARCHITECTURE.

A product's domain is verified from the Domain section of its editor: add the TXT record it shows, then Check DNS. `npm run domains:check` looks up the verified domains that are due through the running dev server, as the production scheduler does every hour; each verified domain is checked about once a day.

Screenshots are taken by `POST /api/screenshots/capture`, every five minutes in production. `npm run screenshots:capture` takes those that are due through the running dev server, with Playwright's Chromium (`npx playwright install chromium`). Every request the browser makes goes through a proxy in the app that connects only to public addresses, so a screenshot cannot reach this machine or its network.

`npm run dev` generates the server-only secrets in `.env.local`: `SUPABASE_SECRET_KEY` (the local service-role key), `STRIPE_KEY_ENCRYPTION_KEY` and `CRON_SECRET`. The encryption key is kept once created; replacing it makes stored provider keys unreadable, and makers would have to reconnect. Production needs the same three secrets with new values, `REVENUE_ALLOW_TEST_KEYS` unset, the SMTP variables for Resend, and the scheduled jobs, which the database runs: `/api/revenue/sync` every ten minutes, `/api/email/send` every minute, `/api/screenshots/capture` every five minutes and `/api/domains/check` every hour, with `Authorization: Bearer $CRON_SECRET` (see Production).

Demo accounts from `npm run db:seed` are `<name>@demo.harbor.test` (for example `lena@demo.harbor.test`) with the password `harbor-demo-password`; `admin@demo.harbor.test` opens the admin panel, where a spam message, a product and a profile wait for review. Their products carry verified test-mode snapshots, with a generated 12-month history, and placeholder keys, so "Refresh now" on a demo product fails the way a revoked key would. Re-running the seed replaces earlier demo accounts, `npm run db:seed -- --remove` removes them with everything in them, and `npm run db:reset` rebuilds the database from the migrations without any data. Seeded products are ordinary listings in the local database, so they count as real products and take the places of the built-in demo products, which live only in code (see ARCHITECTURE). The ports 55320-55329 keep this stack clear of other local Supabase projects on the default 543xx ports. `npm run db:stop` stops the stack and keeps the data.

| Variable                               | Meaning                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase API URL, locally `http://127.0.0.1:55321`                                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key, never a secret or service-role key                                                      |
| `NEXT_PUBLIC_SITE_URL`                 | Public origin for email links, canonical links, the sitemap and sharing images; locally `http://localhost:3001` |
| `LOCAL_MAILPIT_URL`                    | Local development only: shows the local inbox link on sign-in pages                                             |
| `SMTP_HOST`, `SMTP_PORT`               | SMTP server for notification emails; port 465 uses TLS, others must offer STARTTLS unless the host is local     |
| `SMTP_USER`, `SMTP_PASS`               | SMTP sign-in, when the server needs it                                                                          |
| `EMAIL_FROM`                           | Sender of notification emails, such as `The SaaS Harbor <notifications@example.com>`; without it none are sent  |
| `MESSAGE_EMAIL_DELAY_SECONDS`          | How long a message email waits for the recipient to read the message first; default 300                         |
| `DEMO_PRODUCTS`                        | `off` hides the demo products at once; by default they show until 12 real products share verified MRR           |

### Admins

Admins review reports in the admin panel at `/admin`, which is reached from the dashboard. Everyone else gets a 404 there. Admin rights are rows in `private.admins`, which the app cannot write, so they are granted outside it:

```powershell
npm run admin -- grant you@example.com    # the account must exist
npm run admin -- revoke you@example.com
npm run admin -- list
```

The script works on the local stack only. On a production database, run `select public.set_admin('you@example.com', true);` as the database owner, for example in the SQL editor, or call the same function with the service role. Admins cannot be suspended, so remove the rights first. Admins get an email about new reports, makers about decisions, and reporters about the outcome (see Notification emails); makers also see decisions in their dashboard, and reporters under Dashboard → Your reports.

## Verification

```powershell
npm run check         # Prettier, ESLint, TypeScript and unit tests
npm run build
```

Format code with `npm run format`. CI (`.github/workflows/ci.yml`) runs the same checks, the build, the database tests and the browser tests on pushes to `main` and `development` and on pull requests, on Ubuntu 24.04 with every Supabase service the tests use, Realtime included.

### Browser and database tests

These run against the local stack and Mailpit.

```powershell
npm run db:start
npx playwright install chromium
npm run test:db
npm run test:e2e
```

Extra arguments go to Playwright, so `npm run test:e2e -- -g registration` runs one test. A failed test keeps a trace in `test-results/` (`npx playwright show-trace <file>`).

The browser test runner reads local CLI credentials and the Mailpit URL directly into its process environment, refuses non-loopback addresses, and starts the app on `http://127.0.0.1:3002` with a separate build directory, so it can run next to `npm run dev`. Do not share local CLI status output: it includes local test keys. Test users and files are removed afterward, and the tests work with or without demo data. Browser tests cover the home page for founders (its links to sign-up and what a listing gives), registration and confirmation (a new account lands on the product form), login and session persistence, profile/SaaS editing (including links that must point to their own site, and experience that survives a failed save), error-state input retention, images, multiple SaaS, cross-owner denial, password recovery, page titles, themes, responsive layout, and automated WCAG 2.1 AA scans of public, auth and owner pages in both themes. Revenue verification runs against `tests/e2e/fake-providers.mjs` and `fake-billing.mjs`, local stand-ins for the Stripe, Paddle, Polar, Dodo Payments and exchange-rate APIs: connecting each of the three other providers and switching between them, rejected secret keys, missing permissions, a verified $104 account with twelve months of invoice history, the product chart with its table view and keyboard reading, leaderboard trend and growth, a key without invoice access, encrypted storage, private and public MRR, product and account deletion (a wrong name or password changes nothing, a logo that is also the profile photo is kept, and deleting the account removes the user, every owned row and image, and signs out), messaging between two makers (the unread count and replies arrive live, blocks work both ways, a refused message stays in the field, and Send message continues after sign-in), reports and moderation (Report continues after sign-in, a report without the required explanation keeps its choice, a message is reported from the conversation, the admin panel is a 404 for everyone but admins, hiding a product and suspending an account take effect for visitors, the API, the inbox and the maker, who sees the reason, the reporter sees the outcome, both are reversed, and the log lists every decision), demo products (they follow the real products on the first page without ranks, match search and categories, and their pages say they are made up, stay out of search engines and the sitemap, and offer no contact), readable addresses (a permanent redirect from an id, canonical links, the sharing card image, the sitemap and a renamed product's old address), the link to a product's website (followed only with verified revenue), the badge (its headers, private and shared figures, the dark theme, redirects, a hidden product and the editor's code), the statistics page (the empty state below five ranked products, figures that match the leaderboard, the sharing card), pages for search engines and AI assistants (category pages, structured data, titles with shared MRR, llms.txt and the Markdown versions with their redirects and headers), the Content Security Policy (a fresh nonce per response and no blocked resources on any page), notification emails (one email per unread conversation, without the message, turned off and on again in Email settings; the admins' report email, the decision emails with the reason and explanation, and the reporter's outcome email), confirmation and reset links opened in a second browser and refused when used again, the privacy page and the terms, the refresh rate limit, a new password only from a fresh reset link, a category and a tech stack that survive a failed save, the tech stack on the product page and in its Markdown, the technology pages and the technology filter, domain verification (a check without the record, spaced-out checks, another product's code, the mark on the product page and in its Markdown, a forged mark refused, the protected daily check, and a website on another domain losing the mark, with DNS answered by `tests/e2e/fake-site.mjs`), screenshots (the protected job, a screenshot of the fake site's landing page on the product page, in its Markdown and structured data, the editor's view, a new one refused within ten minutes, and turning it off, which removes the image and its file), an empty page past the last one and a repeated search parameter, duplicate-account refusal, disconnection, the protected sync endpoint, and the site statistics (page views and a second page through the site's own navigation, the time a page was visible, a click on a link to another site, sources and campaigns, no cookies, refused beacons from other sites, bots, another visitor's page time and signed-in admins left out, a product page's views that only its founder sees and that leave out the founder's own, and the Analytics page: a card's own period without reloading or scrolling, tabs, the chart's table view, remembered periods, every period in both themes and a phone's width). Automated browsers are not counted, so the other tests leave no page views; the statistics test presents ordinary browsers and adds a few to the local statistics.

`supabase/tests/database` holds the pgTAP suites run by `npm run test:db`. Each runs in a transaction that is rolled back. `access.test.sql` checks actual database grants, RLS and storage ownership, that makers can never write verified figures or read stored keys, the service-only verification RPC, duplicate subscription claims, numeric ranking, zero MRR, independent visibility, stale verifications, disconnection and cascading deletes. `moderation.test.sql` checks that admin rights come only from `private.admins`, that makers cannot write moderation state or date a product, what can be reported and by whom, that reporters and admins alone read reports, that hidden products and suspended accounts disappear from every public read while their owners and admins still see them, the product limits, and what account deletion removes. `slugs.test.sql` checks readable addresses: slugs made from names, numbering when a slug is taken, renames with and without redirects, hidden products and freed slugs. `notifications.test.sql` checks what queues an email and what does not: one email per unread conversation, counted in one email only, settings that only their owner reads and writes, no message text in the queue, report emails at most once an hour, decisions without the admins' internal notes, the outcome for the reporter, the worker's claims, locks, retries and pruning, and account deletion. `hardening.test.sql` checks the limits on revenue checks, that image paths stay in the owner's folder, and that account deletion also removes other makers' queued emails and live events that name the maker. `discovery.test.sql` checks the category counts: only listed products count, and only shared, fresh MRR ranks. `domain_verification.test.sql` checks domain verification: a token per product that only its founder reads, the founder's own, spaced-out checks, results only from the server, three days of grace for a missing record, a new website on another host, the daily check's claims and the token going with the product. `screenshots.test.sql` checks screenshots: a new product is due at once, only the server claims and records them, retries wait longer each time, a screenshot of a changed website is not used, the founder's choice and a new website take it off, a new one at most every ten minutes, and replaced files handed over for deletion once. `tech_stack.test.sql` checks the tech stack: the form of its slugs, at most 20 without repeats, a save without a stack keeps the saved one, and the technology counts follow the category counts. `statistics.test.sql` checks the statistics: only shared, fresh MRR counts, every bucket and category, growth with a basis, product age from shared launch dates, and a history of the months every product covers. `verification.test.sql` checks hourly verification: a re-verification replaces the day's snapshot, a new day or key adds one, and the scheduled run claims only due connections, oldest first, once. `providers.test.sql` checks that connections, snapshots and the public projection name their provider, that a new key may switch it and a re-verification may not, and that only the four providers are accepted. `analytics_reports.test.sql` checks the detailed statistics: only the server records page views, page time and link clicks, visits within 30 minutes, page time only from the same visitor and never shorter, channels and source names, the five periods in a time zone, and every admin report against fixed visits. `product_page_views.test.sql` checks the founder's page views: which page views count for a product, that the founder's own views, hidden products, suspended accounts and views over the hourly limit do not, the three periods, that only the founder reads them, and that they go with the product and the account. `analytics.test.sql` checks the first version of the site statistics: only the server records page views, the daily visitor hash and its salt, that neither the address nor the user agent is stored, visits after 30 quiet minutes, the hourly limit, the admin totals and the retention job. `privileges.test.sql` lists every privilege the API roles hold in `public` and fails on any other, so a new table, column or function needs its grants added there on purpose.

### Database changes

Add every schema change as a new file in `supabase/migrations` (`npx supabase migration new <name>`), never by editing applied migrations. Apply it locally with `npx supabase migration up --local`, which keeps local accounts (`npm run db:reset` rebuilds the database without any data), check that `npx supabase db diff --local` reports no changes, regenerate `src/lib/supabase/database.types.ts` with `npm run db:types`, and extend the pgTAP suites.

### Production preview

```powershell
npm run build
npm start
```

This serves a production build on http://localhost:3001 against the local stack configured in `.env.local`.

### Production

Production runs on three services, all in the EU where they allow it:

- **App:** Vercel, functions in Frankfurt (`fra1`), deployed from `main`. `vercel.json` sets the framework (a project created with the preset Other otherwise looks for a static `public` folder and fails), the region, and turns off deployments of `development`. The Hobby plan is enough to start, since the scheduled jobs run in the database; Vercel allows Hobby only for non-commercial use, so move to Pro once the site earns money. Web Analytics and Speed Insights are turned on under the project's Analytics and Speed Insights tabs; the app renders its script only when `VERCEL_ENV` is `production`, so previews, local servers and tests send nothing. Screenshots run Chromium from `@sparticuz/chromium` inside the screenshot function, which needs Vercel's Node.js 22.x (22.17 or later) and its default memory.
- **Scheduled jobs:** pg_cron in the database calls `POST /api/email/send` every minute, `POST /api/revenue/sync` every ten minutes, `POST /api/screenshots/capture` every five minutes and `POST /api/domains/check` every hour through pg_net, with `Authorization: Bearer` and the production `CRON_SECRET` (migrations `20260926010000_scheduled_jobs.sql`, `20260926100000_domain_verification.sql` and `20260926110000_screenshots.sql`). Where to call and the secret are in Supabase Vault; without them, as locally and in CI, a run does nothing.
- **Database, Auth and Storage:** the Supabase Cloud project `vgwgeennghaqpvfsqewq` ("The SaaS Harbor", Frankfurt, eu-central-1) in the Auxron organization, at `https://vgwgeennghaqpvfsqewq.supabase.co`. Upgrade it to Pro before launch: free projects pause after a week without activity and have no daily backups.
- **Email:** Resend, through SMTP (`smtp.resend.com`, port 465, user `resend`, an API key as password), for both Supabase Auth and the notification emails, from the domain `thesaasharbor.com` in Resend's EU region. Use one API key per sender (Supabase, Vercel) with sending access only, so either can be revoked alone.

**Vercel environment variables** (Production only; previews must not reach the production database):

| Variable                               | Value                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://vgwgeennghaqpvfsqewq.supabase.co`                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key, Supabase dashboard → Project Settings → API Keys           |
| `SUPABASE_SECRET_KEY`                  | A secret key from the same page, created for Vercel (mark as Sensitive)         |
| `NEXT_PUBLIC_SITE_URL`                 | `https://thesaasharbor.com`                                                     |
| `STRIPE_KEY_ENCRYPTION_KEY`            | New for production: 32 random bytes, base64 (see below); keep a copy in a vault |
| `CRON_SECRET`                          | New for production: at least 32 random characters (see below)                   |
| `SMTP_HOST`, `SMTP_PORT`               | `smtp.resend.com`, `465`                                                        |
| `SMTP_USER`, `SMTP_PASS`               | `resend`, the Resend API key for Vercel                                         |
| `EMAIL_FROM`                           | `The SaaS Harbor <notifications@thesaasharbor.com>`                             |

Leave `REVENUE_ALLOW_TEST_KEYS`, `LOCAL_MAILPIT_URL` and the `*_API_BASE` overrides unset. Generate each secret in your own terminal with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste it straight into Vercel. Losing `STRIPE_KEY_ENCRYPTION_KEY` makes every stored provider key unreadable.

**Supabase.** Link a machine once with `npx supabase link --project-ref vgwgeennghaqpvfsqewq` (the CLI must be logged in; it uses a temporary login role, so no database password is needed). Linking also pins production's service versions in `supabase/.temp`, which `supabase start` would then use locally; `npm run db:start` and `db:restart` remove those pins, so the local stack keeps the CLI's versions, as CI does. Start the local stack only through them. Then, only with the owner's approval and after the local checks pass:

- `npx supabase db push --linked --dry-run` lists the migrations production lacks, and `npx supabase db push --linked` applies them. `npx supabase db diff --linked` should then report no changes.
- `npm run auth:production` applies the Auth settings in `supabase/config.toml` with the `[remotes.production]` overrides: site URL and redirect URL on `thesaasharbor.com`, the email templates, 60 seconds between emails to one address, and Resend as SMTP. It asks for the Resend API key hidden, passes it only to the CLI, and asks before pushing, since `supabase config push` itself does not. Production reads its own `HARBOR_PRODUCTION_SMTP_*` variables, so the per-machine SMTP settings in `supabase/.env.local` never reach it. Run it again after changing the Auth settings or templates.

**Scheduled jobs.** After the first deployment, the owner stores where to call and the secret in Vault, in the SQL editor of the production project, with the same `CRON_SECRET` as in Vercel:

```sql
select vault.create_secret('https://thesaasharbor.com', 'harbor_site_url');
select vault.create_secret('<CRON_SECRET>', 'harbor_cron_secret');
```

Until the domain points at Vercel, use the deployment's `https://<project>.vercel.app` address and change it later with `select vault.update_secret(id, 'https://thesaasharbor.com') from vault.secrets where name = 'harbor_site_url';`. A new `CRON_SECRET` goes into both places. `select jobname, status, return_message, start_time from cron.job_run_details join cron.job using (jobid) order by start_time desc limit 10;` shows the latest runs, and `select status_code, created from net._http_response order by created desc limit 10;` the app's answers (200 when all is well, 401 for a wrong secret).

Never run `npm run db:*`, the database tests or the browser tests against production. The pgTAP suites cannot run there anyway: the CLI's temporary login role does not find the pgTAP functions. Grant admin rights in production with `select public.set_admin('you@example.com', true);` in the SQL editor, after that account has signed up.

## Project notes

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Scope and implementation plan](docs/PLAN.md)
- [Verification status, known issues and next steps](docs/STATUS.md)
- [Instructions for coding agents](AGENTS.md)
