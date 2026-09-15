# Implementation status

Updated 2026-09-12. Work was performed directly in `D:\software-projects\the-saas-harbor`, without a worktree, commit, push or external web deployment.

## Implemented

The first release includes accounts, email confirmation and recovery, public maker profiles, multiple editable SaaS per owner, profile/logo uploads, SaaS and maker pages, category/name filtering, newest arrivals, and a USD MRR leaderboard. Each optional metric has a sharing control. Private reports and the current public projection are separate and protected by RLS. No demo data is displayed as real activity.

## Verified

- Clean `npm ci` installation from the lockfile, followed by all checks below.
- ESLint with zero warnings and TypeScript checking.
- Next.js production build.
- 20 unit tests for exact cent parsing, limits, zero versus blank, formatting, URLs and calendar dates.
- Four Chromium integration tests against local Supabase: anonymous/mobile discovery, full registration and email confirmation through Mailpit, profile/SaaS editing and image uploads, validation-error input retention, private/public MRR and revocation, multiple SaaS, sign-out/sign-in/session persistence, cross-owner denial, and password recovery.
- Automated Axe scan of the homepage against WCAG 2 A/AA and 2.1 AA tags, with zero reported violations. Desktop and mobile screenshots were reviewed.
- Transactional SQL access tests against both local and hosted PostgreSQL. They verify owner access, foreign write rejection, storage ownership, history privacy, anonymous permissions, numeric ranking, zero MRR, revocation and independent metric visibility. Test transactions were rolled back.
- Hosted public Data API reads and anonymous metric-history rejection.
- Hosted email signup enabled and email confirmation required, through the public Auth settings endpoint.
- Supabase security advisor: no findings. Foreign-key index findings were fixed. Remaining performance notices are informational unused indexes on the empty/new database; retain them for expected query paths. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Local production preview responds with HTTP 200, correct content and `Cache-Control: no-store, private`.

## Connected project

- Name: The SaaS Harbor
- Project reference: `qvvqkskyukqoleuivdfw`
- Region: `eu-central-1`
- [Dashboard](https://supabase.com/dashboard/project/qvvqkskyukqoleuivdfw)
- Three versioned migrations applied, with local filenames matching hosted migration history.
- An ignored `.env.local` contains only the application's public configuration.

## Remaining account setup

Hosted delivery to a real mailbox and the hosted Auth redirect allowlist remain unverified. Check Site URL and both callback URLs, then configure SMTP as described in README. The complete auth flow was verified locally using Mailpit, without sending external messages.

The website is not deployed to Vercel. The preview uses the real hosted database, which has no seeded public profiles or SaaS. Test users and uploaded files were confined to the local test stack and removed after tests.

## Known scope limits

All revenue is manually reported and unverified. Private metric history is stored but has no chart UI. Old image objects are retained after image replacement/removal from a profile; current displayed references are updated. Account/product deletion UI, automated image cleanup, moderation and the commercial transaction features are future work. These limits do not block the requested first profile/discovery release.

