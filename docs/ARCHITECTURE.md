# Architecture

One Next.js App Router application uses React, TypeScript, Tailwind CSS and shadcn/ui. Supabase provides PostgreSQL, email/password authentication and public image storage. Public pages use server rendering. Mutations use Server Actions with fresh `getUser()` checks; a Proxy refreshes the session cookies using `getClaims()`. `currentUser()` and the public detail loaders (`publicSaas`, `publicProfile`) are wrapped in React `cache()`, so the layout, `generateMetadata` and the page share one round trip per request. `error.tsx` offers `retry()`, which re-fetches server data, and `global-error.tsx` covers failures in the root layout.

## Data and authorization

| Resource                     | Public access                                              | Owner access                                                      |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `profiles`                   | Name, headline, location, About, links, skills, photo path | Insert/update own row, through `save_profile`                     |
| `profile_experience`         | Roles with dates                                           | Insert/delete own roles, through `save_profile`                   |
| `saas`                       | Product description, category, website, logo, owner        | Insert/update/delete own products                                 |
| `saas_settings`              | None                                                       | Read/write own visibility choices and launch date                 |
| `stripe_connections`         | None                                                       | Read own status and key hint; never the key                       |
| `revenue_snapshots`          | None                                                       | Read own verified history; no writes                              |
| `public_metrics`             | Current shared, verified figures and shared launch date    | No writes; kept in sync by a trigger                              |
| `private.*`                  | None (schema not exposed)                                  | None                                                              |
| `public_saas`, `leaderboard` | Public projection with `revenue_status`                    | Same public fields                                                |
| `conversations`, `messages`  | None                                                       | Read conversations they are in; write only through `send_message` |
| `conversation_reads`         | None                                                       | Read/write own read position                                      |
| `blocks`                     | None                                                       | Read/insert/delete own blocks                                     |
| `inbox`                      | None                                                       | Own conversations with the latest message and unread count        |
| `profile-images`             | Image bytes are public                                     | Upload/delete only within own UUID prefix                         |

Every exposed table has RLS and explicit grants. Views use `security_invoker = true`. Composite foreign keys prevent attaching another owner's data to a product. The invoker `save_saas` RPC saves product details, visibility choices and launch date; it accepts no figures. Verified figures are written only by trusted server code with the service-role key, through `record_stripe_verification`, which is executable by `service_role` alone.

The public projection `public_metrics` is maintained by `private.refresh_public_metrics`, called from triggers on `saas_settings`, `revenue_snapshots` and `stripe_connections`. It and its trigger function are SECURITY DEFINER, because a maker's own setting change must update a table the maker cannot write. They live in the unexposed `private` schema, has an empty `search_path`, and its execute privilege is revoked from API roles. An unset sharing flag writes NULL into the projection. Snapshots carry an identity `seq` so "latest" is deterministic even for snapshots taken at the same instant.

Public reads deliberately create a separate anonymous Supabase client. They do not inherit the current owner's session. This makes the public route's data shape identical for an owner and a visitor. All application routes are dynamic; data fetches use `no-store`, and the Proxy sends `Cache-Control: private, no-store`. No shared application/CDN cache holds private records. An already downloaded public page cannot be recalled from a visitor.

## Revenue and discovery

MRR is stored as integer USD cents (at most 999,999,999,999, below JavaScript's safe integer limit) and only ever comes from Stripe verification; see below. Verified MRR, paying customers and launch date have independent visibility switches. A verification older than seven days is hidden by the `public_saas` view and marked `stale`, so it leaves the leaderboard. `revenue_status` is `verified`, `private`, `stale` or `unverified`. The MRR history (`mrr_history`, twelve month-end values) and 30-day growth (`mrr_growth_pct`) reveal MRR, so they are public only when MRR is shared and fresh.

The leaderboard is ordered in PostgreSQL by public MRR descending, then creation time ascending, then UUID ascending. Ties receive deterministic sequential positions. Category filters preserve the global rank. Browse includes products without shared MRR and orders by name. New arrivals orders by creation time descending. List queries return at most 12 rows per page. The server validates category and page inputs and searches product names case-insensitively. User-supplied wildcard characters (`%`, `_`, `*` and backslash) are removed first, since PostgREST treats `*` like `%`.

## Stripe verification

Makers connect a Stripe restricted key (`rk_live_`; `rk_test_` only when `STRIPE_ALLOW_TEST_KEYS=true`) with read access to Subscriptions, Invoices, Coupons and Prices. Secret and publishable keys are rejected. The flow lives in `src/lib/stripe`:

- `client.ts` reads active and past-due subscriptions with expanded discounts, then the coupons and tiered prices they reference, and paid invoices from the last 25 months with all their lines and the prices those lines use. Every request pins `Stripe-Version: 2026-08-26.dahlia`, because responses otherwise follow each account's own default version.
- `mrr.ts` is pure and unit-tested: licensed items normalized to a month (day, week, month, year and interval counts), per-unit and volume/graduated tiers, quantity transforms, forever and repeating discounts (percent and amount), no tax. Trials, paused collection, metered items and one-time discounts are excluded. Paying customers have a subscription worth more than zero.
- `history.ts` is pure and unit-tested. It reconstructs MRR at each of the last twelve month-ends from paid invoices, the way revenue analytics tools do: each subscription line counts its net amount (after discounts and inclusive tax) per month across its service period, full periods by the price's billing interval and prorations by their days. One-off charges and metered usage are excluded. Invoice MRR now against 30 days ago gives the 30-day growth, so both sides of the comparison use the same method. History is converted at today's rates, so the chart shows the business rather than currency moves. A key without Invoices: Read still verifies MRR; the history is then missing and the maker's editor says why.
- `fx.ts` converts other currencies to USD with Frankfurter's daily central-bank rates (base USD). A currency without a rate fails the verification instead of being dropped.
- `crypto.ts` stores keys with AES-256-GCM under `STRIPE_KEY_ENCRYPTION_KEY`, bound to the SaaS id as associated data. The stored format carries a version prefix for later key rotation. Owners can never read the ciphertext: `encrypted_key` is excluded from their column grants.
- `sync.ts` verifies before storing anything, then calls `record_stripe_verification`, which stores the key, claims the counted subscriptions, records a snapshot (with the history and the invoice MRR now and 30 days ago) and updates the connection in one transaction. A subscription can verify one SaaS only (`private.stripe_subscription_claims`, SHA-256 of the subscription id), so one Stripe account cannot be counted twice. Failed re-verifications record a readable error for the owner and keep the last snapshot until it goes stale.

Server actions in `src/app/stripe-actions.ts` check ownership on every call, since the SaaS id is bound on the client. Manual refresh is limited to once per five minutes. `POST /api/stripe/sync` re-verifies every connection when called with `Authorization: Bearer $CRON_SECRET` (compared in constant time); production needs a daily scheduler for it. The service-role key (`SUPABASE_SECRET_KEY`) is only read by `src/lib/supabase/admin.ts`, a server-only module used for these trusted writes.

## Deleting data

Makers delete their account under Maker profile → Delete account, confirming with their password. `deleteAccountAction` (`src/app/actions.ts`) calls `deleteAccount` in `src/lib/account.ts`:

1. It signs in again with the password on a separate client without cookies. Auth's rate limit applies, and a wrong password stops here with nothing changed.
2. With that fresh session it removes every file under the maker's folder in `profile-images` through the Storage API, repeating until the folder lists empty. Storage blocks SQL deletes on `storage.objects`, which has no foreign key to `auth.users`, so files would otherwise outlive the account. If this fails, the account stays in place and can be deleted again.
3. It calls `public.delete_account()`. This SECURITY DEFINER function deletes only `auth.uid()`, and only when the JWT's `amr` claim has a password sign-in from the last five minutes, so a leaked or long-lived session token alone cannot delete an account. It deletes the user's audit log entries (email and IP address), leftover refresh tokens and sign-in flows, then the auth user. Foreign keys cascade to the profile, products, settings, Stripe connections with their keys, subscription claims, snapshots and the public projection. Execute is granted to `authenticated` only.
4. The action signs the browser out and redirects to `/account-deleted`.

Makers delete a single product at the bottom of its editor by typing its name. `deleteSaasAction` checks ownership and the name, removes the logo through the Storage API unless the maker's profile photo or another of their products uses the same file, then deletes the row under the `saas_owner_delete` RLS policy. Foreign keys remove the settings, the public projection, the snapshots and the Stripe connection with its key and claims, which frees the Stripe account for another product. Referential actions run as the table owner, so makers still cannot write those tables directly. Logos replaced earlier are not tracked and stay until the account is deleted.

The pgTAP suite covers the recent-password requirement, who may delete a product, the complete removal and that other makers are untouched. The browser test covers both flows, including a logo that is also the profile photo and images in a subfolder.

The privacy policy is `src/app/privacy/page.tsx`. The operator's name and contact address come from `src/lib/legal.ts`; while they are unset, the page says it is a draft. Anything new that stores personal data must be described there and removed by account deletion, and product-scoped tables need an `on delete cascade` foreign key to `saas`.

## Maker profiles

Profiles are personal and entirely public, and laid out like product pages. `profiles` holds the name, a headline, a location, About (the `bio` column, up to 2,000 characters), links to a website, LinkedIn, GitHub, X and one other site, skills, and the path to the photo. `profile_experience` holds roles with months stored as the first day of the month; a role without an end month is current.

- `save_profile` saves the whole profile and replaces its roles in one transaction. It runs with the maker's rights, so RLS decides and a maker can only write their own profile. A trigger caps a profile at 40 roles however they are written.
- The database repeats the form's rules: skills are at most 20 unique labels of up to 40 characters (checked by `private.valid_labels`), and LinkedIn, GitHub and X links must use https and point to their own site. `profileSchema` in `src/lib/domain.ts` gives the readable messages first.
- The editor (`src/components/profile/profile-form.tsx`) keeps the roles in React state and sends them as JSON. It submits from `onSubmit` rather than the `action` prop, because React resets a form after its action, which would show stale values in controlled fields next to the state that is sent. File fields are cleared after a successful save instead.
- The public page (`src/app/makers/[id]/page.tsx`) follows the product page: a header with the photo, name, headline and location, a row of key figures (products, and verified MRR and paying customers summed over the products that share them, from `makerTotals`), then About, products and experience, with links and skills at the side. Roles are listed current first with LinkedIn-style durations. The owner sees Edit profile and a prompt for missing sections; everyone else sees Send message.

## Messages

Two makers share one conversation (`conversations`, with the participants in a fixed order and a unique pair), created with the first message. Only the two participants can read it, through RLS on `conversations` and `messages`. Everything references `profiles` with `on delete cascade`, so deleting either account deletes the whole conversation, for both makers.

- Writing: `public.send_message(recipient, body)` is the only write path. It is SECURITY DEFINER because makers cannot write these tables, always uses `auth.uid()` as the sender, trims the text (1 to 4,000 characters), requires profiles on both sides, refuses blocked pairs in either direction, and limits each sender to 20 messages a minute, 500 a day and 20 new conversations a day. Errors meant for makers use SQLSTATE P0001; `sendMessageAction` shows those and a generic message for anything else.
- Reading position: `conversation_reads` stores how far each maker has read, never shown to the other maker, so there are no read receipts. `mark_conversation_read` only moves it forward and never past the current time; the view `inbox` and `unread_message_count()` use it.
- Live updates: a trigger announces each new message with `realtime.send` on the private Realtime channels `user:<recipient>` and `user:<sender>`. The event carries ids only, never the text, and an RLS policy on `realtime.messages` lets a maker join only their own channel. `src/components/messages/live.ts` keeps one channel per tab for the header count and the open conversation. The conversation then reads the new message under RLS with the browser client (`src/lib/supabase/browser.ts`), and catches up when a hidden tab becomes visible again. Writes always go through Server Actions.
- The header's unread count is rendered on the server and refreshed on new messages and after reading; the most recently requested count wins. Times are formatted in the visitor's time zone after hydration (`LocalTime`).
- Send message on maker profiles and product pages opens `/messages/<maker id>`. Visitors go to sign-in with `next`, which `safeNext()` limits to the messaging pages, so it cannot send anyone to another site.

## Interface

Styling uses Tailwind utilities in the components. Design tokens (colors, fonts, radii) live as CSS variables in `src/app/globals.css` and map to Tailwind names such as `bg-muted`, `text-muted-foreground` and `text-brand`. There is no page-specific global CSS. The type is Geist, loaded with `next/font`, and body text is never smaller than 12 px. The palette is neutral with one teal accent (`--accent`) for links, focus rings and checkboxes, and a separate `--brand-mark` for the logo. Cards, tables and fields sit on `bg-surface`, one step lighter than the page background. Primary buttons use the foreground color. Destructive buttons use `--destructive` with `--destructive-foreground`, which is dark in the dark theme because white text on the lighter red there fails contrast.

There are two themes, light (warm paper, `#f6f5f1`) and dark (graphite, `#1b1f24`), and neither is pure white or black. `globals.css` defines each token once for light and once inside `@variant dark`. The custom `dark` variant matches `data-theme="dark"` on `<html>`, or the OS dark preference when light was not chosen, so "System" needs no JavaScript. The choice is stored in a `theme` cookie by the theme menu (`src/components/theme-menu.tsx`). A small inline script from `src/lib/theme.ts` runs in `<head>` before first paint and sets `data-theme` from the cookie, following the Next.js guide on preventing flash before hydration. The server never reads the cookie, so the theme does not stop pages from being cached later. `color-scheme` follows the theme, so native controls such as the date picker and scrollbars match. Components should rarely need `dark:` utilities, because the tokens switch instead.

Shared building blocks live in `src/components`: `site-chrome.tsx` (header and footer), `shell.tsx` (page width, page header, notices, empty states), `listings.tsx` (leaderboard, product cards, pagination), `avatars.tsx` (rounded-square product logos, round person avatars), `forms.tsx` (settings-style form sections) and `charts/` (revenue charts).

Charts follow one set of rules. `src/lib/charts.ts` builds chart models on the server (the zero-based axis with round steps, month names, whole-dollar labels), so client code never formats numbers. The product page shows MRR at month end as an area chart (`charts/mrr-chart.tsx`): a client component for the crosshair, the tooltip and reading months with the arrow keys, laid out in percentages so it renders on the server at any width without measuring. A table of the same values sits under it. Leaderboard rows show a 12-month sparkline (muted line, latest month in the accent; its range spans at least 30% of the peak so small wobbles stay small) and the 30-day growth, whose direction is carried by an arrow and a sign as well as by color. Chart colors are the `--chart-1` and `--chart-muted` tokens, checked for lightness, chroma and at least 3:1 contrast on the surface in both themes. Copy is plain and specific, without metaphors. Product logos next to a visible name are decorative (`alt=""`); the maker page avatar carries the maker's name.

## Images and forms

The server validates PNG/JPEG/WebP signatures and the 2 MB limit before uploading an immutable random filename under the authenticated user's prefix. SVG is excluded. Storage enforces the matching MIME/size and ownership policies. Failed database saves remove their newly uploaded file. Replacing or removing a displayed image leaves previous uploads in storage in this first version; a future referenced-file cleanup job can remove them safely.

Validation runs on the server. Forms retain entered text and visibility choices after validation errors; passwords and Stripe keys are never copied into action state. Public links require HTTP(S), and external links use `noopener noreferrer nofollow`. Private editors require ownership even when accessed by a forged URL, and database RLS independently enforces ownership for direct API calls.

## Local Supabase

Supabase runs only locally, in Docker through the Supabase CLI, configured by `supabase/config.toml` and the migrations. No hosted Supabase project is used. `scripts/local-supabase.mjs` reads the local stack's URLs and keys from `supabase status` without printing them, refuses anything that is not on 127.0.0.1, and can start the stack. `npm run dev` runs `scripts/local-env.mjs` first, which starts the stack when needed and writes only the managed keys in `.env.local`. The app only needs the public Supabase variables plus the server-only secrets for Stripe verification, so it can later point at any Supabase instance, self-hosted or Cloud.

## Authentication and local tests

Authentication is Supabase Auth (email and password). Signup and password recovery use PKCE and the default Supabase confirmation links. `/auth/callback` exchanges the code and accepts only the fixed dashboard or password-update destination. Redirect allowlists, email confirmation and the 12-character password minimum are set in `supabase/config.toml`. By default every local email goes to Mailpit; `LOCAL_MAILPIT_URL` makes the sign-in pages link to it and is only honored for a loopback address. `[auth.email.smtp]` in `config.toml` reads `HARBOR_SMTP_*` through `env()`. The Supabase CLI resolves those from `supabase/.env` (committed defaults, real email off), then `supabase/.env.local` (git-ignored, per machine), then the process environment. `scripts/local-supabase.mjs` starts the stack with real email only when a password is present, can force Mailpit, and reads the running Auth container's SMTP host to report the active mode. The browser tests refuse to run unless email goes to Mailpit, so they can never email real addresses.

`scripts/test-local.mjs` obtains credentials and the Mailpit URL from the local CLI without printing them, refuses non-loopback addresses, and starts Playwright with a separate `.next-e2e` output. Its admin credential exists only in the test process. Email stays inside local Mailpit. Tests remove their users and uploaded files afterward. The local stack uses its own port range (55320-55329) so it can run next to other local Supabase projects. Database access tests are a pgTAP suite (`supabase/tests/database`) that runs inside a rolled-back transaction and has no persistent test fixtures.

## Deliberate limits

There are no company profiles, transaction features, email notifications, message reporting or moderation, revenue integrations other than Stripe, or image garbage collector (replaced images stay until the account is deleted). The first version is an owner-usable profile and discovery application. Real usage may warrant abuse controls, moderation, optimized images and cache design before broader public launch.

## Sources checked during implementation

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), plus installed `next/dist/docs` for Forms, Proxy and Server Actions.
- [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next).
- Stripe [restricted API keys](https://docs.stripe.com/keys/restricted-api-keys), [list subscriptions](https://docs.stripe.com/api/subscriptions/list), [Discount object](https://docs.stripe.com/api/discounts/object) and the [changelog](https://docs.stripe.com/changelog) (Discount `source.coupon` since 2025-09-30.clover). [Frankfurter](https://frankfurter.dev/) v2 rates.
- The installed Next.js ESLint guide documents standalone `@next/eslint-plugin-next`. ESLint 10 runs the recommended JavaScript, TypeScript, React Hooks, and Next.js Core Web Vitals rules through compatible native plugins.
