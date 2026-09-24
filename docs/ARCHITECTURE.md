# Architecture

One Next.js App Router application uses React, TypeScript, Tailwind CSS and shadcn/ui. Supabase provides PostgreSQL, email/password authentication and public image storage. Public pages use server rendering. Mutations use Server Actions with fresh `getUser()` checks; a Proxy refreshes the session cookies using `getClaims()`. `currentUser()` and the public detail loaders (`publicSaas`, `publicProfile`) are wrapped in React `cache()`, so the layout, `generateMetadata` and the page share one round trip per request. `error.tsx` offers `retry()`, which re-fetches server data, and `global-error.tsx` covers failures in the root layout.

## Data and authorization

| Resource         | Public access                                       | Owner access                              |
| ---------------- | --------------------------------------------------- | ----------------------------------------- |
| `profiles`       | Public name, bio, website, social link, image path  | Insert/update own row                     |
| `saas`           | Product description, category, website, logo, owner | Insert/update own products                |
| `metric_reports` | None, including for another authenticated owner     | Read and append own dated reports         |
| `public_metrics` | Only the current deliberately shared values         | Publish or clear own values               |
| `public_saas`    | Explicit public projection                          | Same public fields                        |
| `leaderboard`    | Products with public non-null MRR                   | Same public ranking                       |
| `profile-images` | Image bytes are public                              | Upload/delete only within own UUID prefix |

Every exposed table has RLS and explicit grants. Views use `security_invoker = true`. There are no security-definer functions and no service-role credentials in the application. Composite foreign keys prevent assigning another owner's metrics to a product. The invoker `save_saas` RPC atomically saves the product, appends a private report, and replaces the public projection. An unset sharing flag writes NULL into the public projection, including when old reports contained published values. Historical reports remain owner-only.

Public reads deliberately create a separate anonymous Supabase client. They do not inherit the current owner's session. This makes the public route's data shape identical for an owner and a visitor. All application routes are dynamic; data fetches use `no-store`, and the Proxy sends `Cache-Control: private, no-store`. No shared application/CDN cache holds private records. An already downloaded public page cannot be recalled from a visitor.

## Revenue and discovery

MRR uses integer USD cents with a maximum of 999,999,999,999 cents, below JavaScript's safe integer limit. Parsing uses decimal strings without floating-point multiplication. Blank MRR differs from zero. Customer count and launch date have independent visibility switches. Each report has a database timestamp. Values are always self-reported.

The leaderboard is ordered in PostgreSQL by public MRR descending, then creation time ascending, then UUID ascending. Ties receive deterministic sequential positions. Category filters preserve the global rank. Browse includes products without shared MRR and orders by name. New arrivals orders by creation time descending. List queries return at most 12 rows per page. The server validates category and page inputs and searches product names case-insensitively. User-supplied wildcard characters (`%`, `_`, `*` and backslash) are removed first, since PostgREST treats `*` like `%`.

## Interface

Styling uses Tailwind utilities in the components. Design tokens (colors, fonts, radii) live as CSS variables in `src/app/globals.css` and map to Tailwind names such as `bg-muted`, `text-muted-foreground` and `text-brand`. There is no page-specific global CSS. The type is Geist, loaded with `next/font`, and body text is never smaller than 12 px. The palette is neutral with one teal accent (`--accent`) for links, focus rings and checkboxes, and a separate `--brand-mark` for the logo. Cards, tables and fields sit on `bg-surface`, one step lighter than the page background. Primary buttons use the foreground color.

There are two themes, light (warm paper, `#f6f5f1`) and dark (graphite, `#1b1f24`), and neither is pure white or black. `globals.css` defines each token once for light and once inside `@variant dark`. The custom `dark` variant matches `data-theme="dark"` on `<html>`, or the OS dark preference when light was not chosen, so "System" needs no JavaScript. The choice is stored in a `theme` cookie by the theme menu (`src/components/theme-menu.tsx`). A small inline script from `src/lib/theme.ts` runs in `<head>` before first paint and sets `data-theme` from the cookie, following the Next.js guide on preventing flash before hydration. The server never reads the cookie, so the theme does not stop pages from being cached later. `color-scheme` follows the theme, so native controls such as the date picker and scrollbars match. Components should rarely need `dark:` utilities, because the tokens switch instead.

Shared building blocks live in `src/components`: `site-chrome.tsx` (header and footer), `shell.tsx` (page width, page header, notices, empty states), `listings.tsx` (leaderboard, product cards, pagination), `avatars.tsx` (rounded-square product logos, round person avatars) and `forms.tsx` (settings-style form sections). Copy is plain and specific, without metaphors. Product logos next to a visible name are decorative (`alt=""`); the maker page avatar carries the maker's name.

## Images and forms

The server validates PNG/JPEG/WebP signatures and the 2 MB limit before uploading an immutable random filename under the authenticated user's prefix. SVG is excluded. Storage enforces the matching MIME/size and ownership policies. Failed database saves remove their newly uploaded file. Replacing or removing a displayed image leaves previous uploads in storage in this first version; a future referenced-file cleanup job can remove them safely.

Validation runs on the server. Forms retain entered text and visibility choices after validation errors; password values are never copied into action state. Public links require HTTP(S), and external links use `noopener noreferrer nofollow`. Private editors require ownership even when accessed by a forged URL, and database RLS independently enforces ownership for direct API calls.

## Local Supabase

Supabase runs only locally, in Docker through the Supabase CLI, configured by `supabase/config.toml` and the migrations. No hosted Supabase project is used. `scripts/local-supabase.mjs` reads the local stack's URLs and keys from `supabase status` without printing them, refuses anything that is not on 127.0.0.1, and can start the stack. `npm run dev` runs `scripts/local-env.mjs` first, which starts the stack when needed and writes only the managed keys in `.env.local`. The app itself only knows the three public variables, so it can later point at any Supabase instance, self-hosted or Cloud.

## Authentication and local tests

Authentication is Supabase Auth (email and password). Signup and password recovery use PKCE and the default Supabase confirmation links. `/auth/callback` exchanges the code and accepts only the fixed dashboard or password-update destination. Redirect allowlists, email confirmation and the 12-character password minimum are set in `supabase/config.toml`. Locally, every email goes to Mailpit; `LOCAL_MAILPIT_URL` makes the sign-in pages link to it and is only honored for a loopback address. Production email delivery needs an SMTP provider.

`scripts/test-local.mjs` obtains credentials and the Mailpit URL from the local CLI without printing them, refuses non-loopback addresses, and starts Playwright with a separate `.next-e2e` output. Its admin credential exists only in the test process. Email stays inside local Mailpit. Tests remove their users and uploaded files afterward. The local stack uses its own port range (55320-55329) so it can run next to other local Supabase projects. Database access tests are a pgTAP suite (`supabase/tests/database`) that runs inside a rolled-back transaction and has no persistent test fixtures.

## Deliberate limits

There are no company profiles, deletion/account-erasure UI, transaction features, messaging, revenue integrations, image garbage collector, or historical chart UI. The first version is an owner-usable profile and discovery application. Real usage may warrant abuse controls, moderation, optimized images and cache design before broader public launch.

## Sources checked during implementation

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), plus installed `next/dist/docs` for Forms, Proxy and Server Actions.
- [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next).
- The installed Next.js ESLint guide documents standalone `@next/eslint-plugin-next`. ESLint 10 runs the recommended JavaScript, TypeScript, React Hooks, and Next.js Core Web Vitals rules through compatible native plugins.
