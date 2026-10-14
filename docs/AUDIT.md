# Production-readiness audit

Audited 2 October 2026 at `85f334f`, against the code and the live site (pjk.co.in, read-only
requests only). Fixes followed in `ec76c01`…`1e70daf`; the [fix list](#fix-list) has each one's
commit. The site is about to start holding sensitive personal data for artists and
partners, and the bar here reflects that: the aim is sound defaults for a small business, not
enterprise ceremony.

Each area is one of:

- **Done.** Already sound, with evidence. Left alone.
- **Needs work.** Severity (critical, high, medium, low) and a proposed fix. Items with an ID
  (`A1`…) are tracked in the table at the end.
- **Not needed at this scale.** With the reason.

Things that need someone with dashboard access (Vercel, Neon, GitHub) are collected in
[What needs doing by hand](#what-needs-doing-by-hand).

---

## 1. System design and architecture

**Done.** One Next.js 16 app with Payload 3 in-process, statically rendered pages purged on edit
(`src/hooks/revalidateFrontend.ts`), hostname-to-brand routing as a pure string rewrite
(`src/proxy.ts:56`), and every frontend query scoped to a brand through `src/utilities/queries.ts`.
For one company and a handful of brands this is the right shape: there is nothing to split out.

**Needs work, high (`A1`).** `src/access/authenticated.ts:8` treats *any* signed-in user as staff,
and `src/access/authenticatedOrPublished.ts:4` shows drafts to anyone signed in. Today the only
auth collection is staff `users`, so this is correct. Phase 3 adds a `members` auth collection, and
from that moment every one of those checks would let an artist create pages, read drafts, upload
media and read enquiries. The preview route has the same assumption
(`src/app/(frontend)/next/preview/route.ts:51`). **Fix:** an `isStaff(user)` check that requires
`user.collection === 'users'`, used everywhere access is decided, before members exist.

**Follow-up for Phase 3.** Payload's own default for a collection with no access rule is "anyone
signed in" (`node_modules/payload/dist/auth/defaultAccess.js`), and its internal collections use it:
media folders, locked documents, the job queue. The form builder's `forms` collection also leaves
create, update and delete at that default. `isStaff` cannot reach those, so Phase 3 adds one central
guard that gives a signed-in member exactly a visitor's access on every collection not built for
members.

## 2. Frontend

**Done.** Pages are prerendered and served from the CDN (`x-nextjs-prerender: 1`,
`x-vercel-cache: HIT` on `/`). Images go through `next/image` with AVIF/WebP (`next.config.ts`).
Fonts are self-hosted by `next/font` with `display: swap`. No third-party script loads on the
public site.

**Needs work, low (`A2`).** The journal index rows (`src/components/cards/PostCard.tsx:35`) still
reveal their link only on hover, the problem the ventures index had until `e170fda`. **Fix:** the
same `.row-link`/`.row-title`/`.row-arrow` treatment as `VentureRow`.

## 3. API and backend logic

**Done.** Admin gate, code requests and access requests validate input, cap lengths and reply
identically whether or not an account exists
(`src/app/(frontend)/next/admin-gate/request-code/route.ts`). Form submissions are checked against
the form definition on the server (`src/collections/FormSubmissions/overrides.ts`). Preview only
accepts relative paths.

**Needs work, low (`A3`).** Corrected after testing: the form builder already hides a form's
`emails` (notification recipients, CC, BCC) from anonymous readers, so the empty `emails: []` on the
live API is the plugin's doing, not an empty configuration. But its rule is "anyone signed in", so
from Phase 3 any member could read the internal inbox addresses. **Fix:** field-level read access on
`emails` for staff only.

**Check by hand (`A4`).** Because the public API hides `emails` (above), I cannot tell from outside
whether the live forms send notifications. If enquiries are not reaching an inbox, the fix is in the
admin panel: **Enquiries → Forms → Contact / Collaborate → Emails**.

## 4. Database and storage

**Done.** Postgres via Payload's adapter with migrations committed (`src/migrations/`), applied on
every production deploy. A fresh database built only from the migrations matches the code's schema
exactly (checked: `payload migrate` then `payload migrate:create --skip-empty` produces nothing).
The visitor count increments atomically in SQL (`src/app/(frontend)/next/visits/route.ts`).

**Cannot verify from here.** Whether production `DATABASE_URL` is Neon's *pooled* string (host
contains `-pooler`). `docs/SETUP.md` tells you to use it, and there are no production credentials
on this machine. See [by hand](#what-needs-doing-by-hand).

**Needs work, medium (`A5`), Vercel Blob is public.** Media is stored in a public Blob store. Right
for photographs; wrong for identity documents. Vercel now offers private Blob stores, whose files
can only be read with a token through our own functions. The access mode is fixed when a store is
created, so KYC documents (Phase 5) need a **second, private store**; and they are encrypted before
upload regardless.

## 5. Auth and permissions

**Done.** Staff sign-in needs a company mailbox code, an approved account and a password
(`src/proxy.ts`, `src/collections/Users/index.ts`). Codes are 6 digits, hashed with a per-challenge
salt and compared in constant time (`src/security/otp.ts`). Roles can only be changed by super
admins (`src/collections/Users/index.ts`, field access). Payload locks an account after 5 wrong
passwords (`src/collections/Users/index.ts:46`). Suspension blocks sign-in immediately. Every event
goes to the security log.

**Needs work, medium (`A6`).** Payload's own session cookie (`payload-token`) is set **without the
`Secure` flag**: Payload defaults `auth.cookies.secure` to `false`
(`node_modules/payload/dist/collections/config/defaults.js:121`) and `Users` does not override it.
HSTS with preload makes a plain-HTTP leak unlikely, but the flag should be there. **Fix:**
`auth.cookies.secure` in production.

**Needs work, by hand.** The super admin password was shared in chat early on and should be treated
as exposed. **Rotate it** (`/admin` → your account → change password, or `pnpm create-admin` with
the production `DATABASE_URL`). You said you would do this yourself.

## 6. Hosting and cloud

**Done.** Vercel with automatic HTTPS, HSTS preload, deploys from `main`, crons authenticated with
`CRON_SECRET` (`src/payload.config.ts`, `jobs.access.run`).

**Needs work, high (`A7`), preview deployments migrate the production database.**
`vercel-build` is `payload migrate && pnpm build` (`package.json:23`), and Vercel runs it for
**every** deployment, previews included. `docs/SETUP.md` sets the same `DATABASE_URL` for Production
and Preview. So pushing *any* branch to GitHub would apply that branch's migrations to the live
database before anyone has reviewed it. That is exactly what must not happen with the KYC and
member migrations in Phases 3–5. **Fix:** only migrate when `VERCEL_ENV=production`, or when a
preview has been given its own database and opts in with `MIGRATE_ON_PREVIEW=1`.

**Needs work, medium, by hand.**

- **Function region.** Functions ran in Washington (`iad1`, confirmed on the deploy of
  `dcf6291`) while Neon is in Singapore (`ap-southeast-1`), so every database query crossed the
  world: `/api/health` took 2.9 s on a cold start. Now pinned to Singapore (`sin1`) in
  `vercel.json`, so the setting is versioned with the code.
- **Plan.** Vercel's Hobby plan is for non-commercial use. Once artist and partner data are held,
  move to Pro (also lifts the one-daily-cron limit and the 1-hour log retention).

## 7. CI/CD and version control

**Done.** `main` is the deploy branch, history is clean and prose-only, local tooling
files are kept out of the repository, and `agentRules: false` is set.

**Needs work, high (`A8`).** There is **no CI**. Lint, typecheck, tests and build run only when
someone remembers. **Fix:** `.github/workflows/ci.yml` running lint, typecheck, integration tests
against a Postgres service, a migration-drift check, and the production build, on every push and
pull request.

**Needs work, by hand.** Branch protection on `main` and preview databases. See
[by hand](#what-needs-doing-by-hand).

## 8. Security

### Headers

**Done.** HSTS (2 years, subdomains, preload), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` and
`frame-ancestors 'self'`, a `Permissions-Policy`, and a CSP, all set in `next.config.ts:38-47` and
confirmed on the live response. Uploaded files are served with `sandbox` and `default-src 'none'`
(`next.config.ts:55-61`).

**Needs work, medium (`A9`).** The CSP's `script-src` allows `'unsafe-eval'` and
`https://cdn.jsdelivr.net` **on every page** (`next.config.ts:30`), though only the admin panel
needs them. `connect-src` allows any `https:` origin. **Fix:** split the policy. The public site
gets no `'unsafe-eval'`, no jsDelivr, and `connect-src 'self'`; `/admin` keeps what it needs. Add
`Cross-Origin-Opener-Policy: same-origin` and replace the obsolete `interest-cohort` with
`browsing-topics`.

**Nonce-based CSP: not feasible without giving up static pages.** A nonce must be different on
every response, so every page would have to render per request: the CDN could no longer serve the
cached HTML, and every visit would cost a function call and a database read. Next.js documents
this trade-off. `'unsafe-inline'` therefore stays on `script-src` for the public site. The
remaining risk is small because there is no user-generated HTML on public pages, rich text is
rendered by Lexical's serializer rather than injected, and JSON-LD is escaped
(`src/components/JsonLd.tsx`). Revisit only if the site starts rendering untrusted HTML.

### Host header

**Done.** The `Host` header is validated as a bare hostname before it is interpolated into the
rewrite (`src/utilities/host.ts`), with a second check on the result (`src/proxy.ts:60`).

### Payload hardening (`A10`, medium)

| | |
| --- | --- |
| GraphQL | **Unused** (the site uses the Local API, the admin uses REST) but enabled, and its playground route exists. Only the admin gate stands in front of it. **Fix:** `graphQL.disable: true` and remove the two route files. |
| `maxDepth` | Payload's default of 10 is allowed on every REST read, so `?depth=10` on a public collection is an amplification lever. The frontend never asks for more than 2. **Fix:** `maxDepth: 4`. |
| CSRF and CORS | **Done.** Both limited to the site's own origin plus `ALLOWED_ORIGINS` (`src/payload.config.ts:108-109`). |
| Upload MIME types | `image/*` accepts anything that calls itself an image. **Fix:** an explicit list (JPEG, PNG, WebP, AVIF, GIF, SVG, MP4, WebM, PDF). SVG stays allowed because brand marks are SVG; the sandbox headers already defuse script inside one. |
| Upload size | No limit. **Fix:** `upload.limits.fileSize` of 20 MB. |

### Dependencies (`A11`, critical)

`pnpm audit --prod` reports 13 advisories:

| Severity | Package | Via | Patched in |
| --- | --- | --- | --- |
| critical | `next` 16.3.3 | direct | 16.3.6. RCE in `next/og`'s `ImageResponse`. **The site does not import `next/og`**, so it is not exploitable here, but upgrade anyway. |
| high ×2, moderate ×5, low ×3 | `undici` < 7.29.1 | `payload` | 7.29.1 (DoS, TLS validation bypass, cookie disclosure) |
| moderate | `fast-uri` < 3.1.8 | `payload` → `ajv` | 3.1.8 |
| low | `dompurify` 3.4.13–3.4.15 | admin code editor | 3.4.16 |

**Fix:** Next.js 16.3.8, and `pnpm-workspace.yaml` overrides for the transitive packages (the same
mechanism already used for `dompurify` and `esbuild`). Pin every direct dependency to an exact
version, pin pnpm with `packageManager`, and add Dependabot (weekly, grouped, so it does not open
twenty pull requests). Payload 3.90 is available; it is a minor upgrade worth doing as its own
change once CI exists to catch any schema difference.

## 9. Rate limiting

**Done.** Admin code requests are limited **in Postgres**, by counting recent `login-challenges`
rows per email and per IP (`src/app/(frontend)/next/admin-gate/request-code/route.ts:52-66`), so
the limit holds across serverless instances. Access requests likewise (3 per IP per day).

**Needs work, high (`A12`).** Form submissions are limited by an **in-memory `Map`**
(`src/collections/FormSubmissions/overrides.ts:15`). Every serverless instance has its own, and
instances come and go, so the "5 per 10 minutes" in `SECURITY.md` is not what actually happens.
It also exempts any signed-in user (`:43`), which will include members after Phase 3.

**Recommendation: a Postgres-backed limiter in the app, with one Vercel Firewall rule outside it.**

- *Postgres* is free, already there, works on Hobby, is covered by tests, and can key on things
  the edge cannot see: an email address, a member, a form. One atomic
  `INSERT … ON CONFLICT … DO UPDATE … RETURNING` per check, so concurrent requests cannot race.
  Keys are stored as keyed hashes, so the table holds no IP addresses or emails.
- *Vercel Firewall*: Hobby allows exactly **one** rate-limit rule (keyed on IP, fixed window, 10 s
  to 10 min). Use it as a coarse outer wall against floods on `POST /next/*` and `POST /api/*`,
  e.g. 60 requests a minute per IP. It cannot do per-email limits, and it is invisible to tests, so
  it complements the app limiter rather than replacing it.

**Low, noted only.** The admin bar, rendered on every public page, asks `/api/users/me` whether the
visitor is signed in; the admin gate answers 401 for everyone outside the company, so every visitor's
console shows one failed request. It is answered at the edge without touching a function or the
database, so it costs nothing, but it is noise. Worth rendering the bar only when the gate cookie is
present, when that code is next touched.

**Not needed at this scale.** The visitor count's in-memory repeat check
(`src/app/(frontend)/next/visits/route.ts:30`) is per instance, and that is fine: the worst case
is a slightly generous count, and holding visitor addresses in the database would contradict the
privacy page.

## 10. Environment validation

**Needs work, medium (`A13`).** Nothing checks the environment. A missing `PAYLOAD_SECRET` is only
discovered when the gate first tries to sign a token; a missing `DATABASE_URL` is passed to Postgres
as an empty string (`src/payload.config.ts`). **Fix:** a zod schema in `src/env.ts`, loaded by the
Payload config so it runs at boot, at build and at `payload migrate`, failing with a message that
names each missing or malformed variable. Strict where a mistake is dangerous, lenient where the
existing code has a safe fallback, so it cannot take the live site down over an optional value.

## 11. Error tracking and logs

**Needs work, medium (`A14`).** Logs are Payload's pino logger with no redaction. Today they carry
email addresses (the dev-only code print, access-request notices, failure messages such as
`src/security/provision.ts`'s "Could not send the password email to …"), and from Phase 3 they would
be one careless line away from a PAN or account number. **Fix:** a redaction layer hooked into the
logger itself, so it applies to every log line, from our code, Payload's and plugins' alike. It
masks email addresses, phone numbers, PAN, Aadhaar-like and account-number-like digit runs, and
IFSC codes, in strings, objects and errors. A test logs a PAN and asserts it is gone. Plus Next's
`onRequestError` hook, so unhandled errors are logged as one structured, redacted line.

**Proposal, not added: Sentry.** Free developer plan, 5 000 errors a month, needs an account.
With the redaction layer as its `beforeSend`, plus `sendDefaultPii: false`, it would tell you about
errors instead of you finding them in a log that Hobby keeps for an hour. **Your call.**

## 12. Monitoring and alerts

**Needs work, medium (`A15`).** There is no health endpoint (`/api/health` returns 404 today).
**Fix:** `GET /api/health`, which checks that the database answers and returns `ok` or `503` with
the commit it is running, and nothing else. No secrets, no counts, never cached.

**Proposal, not added: an external uptime check.** Better Stack or UptimeRobot (both free tiers,
both need an account) polling `/api/health` every few minutes and emailing
`tech@pjk.co.in`. Vercel has no built-in uptime alerting on Hobby.

## 13. Caching and CDN

**Done.** Static HTML from the CDN, purged on publish, hourly safety refresh
(`src/app/(frontend)/tenant-sites/[host]/layout.tsx`). Optimised images are cached by the image
optimizer. Media originals carry `Cache-Control: public, max-age=31536000`.

**Not needed at this scale.** Media originals at `/api/media/file/*` are not cached at the CDN
(`x-vercel-cache: MISS`), because `max-age` alone is a browser instruction on Vercel. Almost every
image on the site is served through `/_next/image` instead, which is cached. Revisit if function
invocations ever show up on the bill.

## 14. Testing

**Done.** 25 integration and unit tests (`tests/int/`) covering tenancy, form validation, the
admin gate, OTPs and passwords. They pass. Playwright specs exist for the frontend and admin.

**Since then.** Every push runs the integration suite (`verify`) and the end-to-end suite (`e2e`,
Playwright against a throwaway Postgres) in CI; a skipped test fails the run. The end-to-end
tests (`tests/e2e/`) walk through the flows that matter most: an artist application with KYC (both
identity paths, stopping halfway and coming back), a partner application, signing in with a code,
staff approval issuing an ID, an approved artist adding a work, a pending artist kept out of the
portal, a bank change stopped with "this was not me", and a staff and a member session in one
browser. Test runs never send email (`playwright.config.ts`, `vitest.setup.ts`).

**Not covered end to end, by choice.** Each is covered by integration tests where noted; worth
adding if the flow changes or breaks:

- Staff reviewing a work or a profile in the admin (integration: `portal`).
- KYC reveal and document download through the reason dialog (integration: `kyc`).
- Recording a consent withdrawal, and setting a legal hold (integration: `kyc`).
- Changing the email address with a code to the new address (integration: `portal`).
- Data copy and deletion requests from the account page.
- The weekly KYC purge (integration: `kyc`).
- Firefox, Safari and phone-sized screens: Chromium at desktop size only.
- An automated accessibility check (axe) on the application steps.

## 15. Scaling

**Not needed at this scale.** Static pages from the CDN and stateless serverless functions scale
on their own. The one shared resource is Postgres connections, which Neon's pooled endpoint
handles, provided it is the pooled string (see section 4).

## 16. Backups and recovery

**Needs work, medium, by hand (`A16`).** Neon's restore window depends on the plan, and I could not
see which plan you are on:

| Neon plan | Point-in-time restore window |
| --- | --- |
| Free | 6 hours, fixed |
| Launch | up to 7 days |
| Scale | up to 30 days |

Six hours is not enough once member and KYC data exist: a bad migration discovered the next morning
would be unrecoverable. **Recommendation:** Launch with a 7-day window before Phase 3 goes live,
plus a monthly `pg_dump` kept offline (procedure below).

Vercel Blob has no versioning: a deleted media file is gone. Media is replaceable (it was uploaded
by the team), and KYC documents will be backed up only through the database plus Blob, so the
monthly dump should be accompanied by a copy of the private store (`vercel blob` CLI, below).

### Restore procedure

1. **Something went wrong in the last few hours/days (within the window).** Neon console →
   project → **Branches** → `main` → **Restore** → choose a time just before the problem →
   restore. Neon keeps the pre-restore state as a backup branch, so a mistaken restore can itself
   be undone. Then redeploy in Vercel so every function reconnects.
2. **To inspect before restoring.** Neon → **Branches → Create branch** → *from a point in time*.
   Connect to that branch with `psql` and check the data, then restore `main` as above (or copy the
   rows you need across).
3. **Outside the window: from a dump.**
   ```bash
   createdb pjk_restore
   pg_restore --no-owner --dbname=pjk_restore pjk-YYYY-MM-DD.dump   # check it locally first
   # then, into a fresh Neon branch, and point DATABASE_URL at it:
   pg_restore --no-owner --clean --if-exists --dbname="$NEON_BRANCH_URL" pjk-YYYY-MM-DD.dump
   ```
4. **Taking the monthly dump** (use the *direct*, non-pooled connection string for `pg_dump`):
   ```bash
   pg_dump --format=custom --no-owner --file=pjk-$(date +%F).dump "$NEON_DIRECT_URL"
   ```
   Store it encrypted and offline (an encrypted disk image or 1Password document), never in the
   repository, a chat, or a shared drive. KYC fields will be encrypted inside the dump, but names,
   emails and phone numbers will not.

## 17. Dependency hygiene

See `A11` above. Also: `pnpm-workspace.yaml` already pins patched transitive versions, and the
lockfile is committed.

## 18. Accessibility

**Done.** `lang="en-IN"`, a skip link to `#main` (`src/components/SiteHeader/HeaderClient.tsx:69`),
alt text required on every upload (`src/collections/Media.ts:36`), required fields announced to
screen readers (`src/blocks/Form/FieldShell.tsx:33`), `prefers-reduced-motion` honoured by every
animation (`globals.css`), and body text at 13:1 contrast.

**Needs work, low.** The focus ring is a 1px outline (`globals.css:127-130`). It passes WCAG 2.2
AA, but it is faint. The onboarding forms (Phase 7) will use a 2px ring in the brand accent; worth
bringing the rest of the site up to match then.

## 19. SEO

**Done.** Per-brand sitemap and robots (`src/app/(frontend)/tenant-sites/[host]/sitemap.xml`,
`robots.txt`), previews kept out of the index, canonical URLs, Open Graph and Twitter cards
(`src/utilities/meta.ts`), and `Organization` JSON-LD (`src/components/JsonLd.tsx`).

**Needs work, low (`A17`).** Doubled titles. `/ventures` serves
*"Our ventures in art and craft | PAT and J.K. Co. — PAT and J.K. Co."*, because its SEO title
already contains the site name and the layout's template appends it again. `/about`'s title also
starts with a stray tab. **Fix:** trim titles, and set a title as absolute when it already
contains the site name. JSON-LD gains the postal address in Phase 2.

---

## Fix list

In the order they are fixed. Each is its own commit.

| ID | Severity | Area | Fix | Status |
| --- | --- | --- | --- | --- |
| A11 | critical | Dependencies | Next.js 16.3.8, overrides for undici, fast-uri, dompurify; exact pins; Dependabot | done `ec76c01` |
| A7 | high | Hosting | Migrate only on production deploys, unless a preview opts in | done `99195cd` |
| A1 | high | Auth | `isStaff()` everywhere access is decided, before members exist | done `c33fd04`, guard `5e6a893` |
| A12 | high | Rate limiting | Postgres-backed limiter with hashed keys; forms use it | done `b056cd5`, `972189c` |
| A8 | high | CI | GitHub Actions: lint, typecheck, tests, migration drift, build | done `7f20841` |
| A6 | medium | Auth | `Secure` on the staff session cookie | done `4fa06e6` |
| A9 | medium | Headers | Split CSP: no `unsafe-eval` or jsDelivr on public pages; COOP | done `139efc9` |
| A10 | medium | Payload | GraphQL off, `maxDepth: 4`, explicit MIME list, 20 MB limit | done `ccd9155` |
| A3 | low | API | Form notification recipients readable by staff only | done `4158ee9` |
| A13 | medium | Env | zod validation at boot | done `8119e14`, `c7f5c0b` |
| A14 | medium | Logs | Redaction layer on the logger; structured request errors | done `c30fae9` |
| A15 | medium | Monitoring | `/api/health` | done `4f68e32` |
| A17 | low | SEO | No doubled or untrimmed titles | done `7fcaf6f` |
| A2 | low | Frontend | Journal rows get the ventures index's affordance | done `1e70daf` |
| A4 | check | Forms | Confirm both forms notify an inbox | by hand |
| A5 | medium | Storage | Private Blob store for KYC documents | Phase 5 |
| A16 | medium | Backups | Neon plan with ≥ 7-day restore; monthly offline dump | by hand |

## What needs doing by hand

> Superseded by [LAUNCH.md](LAUNCH.md), which carries what is still open. Kept for the record.

**Vercel**

1. **Settings → Environment Variables → `DATABASE_URL`**: check the Production value's host contains
   `-pooler`. If not, replace it with Neon's pooled string (Neon → Connect → *Pooled connection*).
2. **Settings → Environment Variables**: give **Preview** its own database. In Neon, create a branch
   called `preview` from `main`, copy its pooled connection string, and set it as `DATABASE_URL` for
   the *Preview* environment only. Then also set `MIGRATE_ON_PREVIEW=1` for Preview only. Until you
   do, previews skip migrations and may show errors for brand-new fields, which is the safe failure.
3. ~~Function region~~: done in `vercel.json` (`sin1`, beside Neon's `ap-southeast-1`).
4. **Firewall → Configure → New Rule**: *If* Request Path starts with `/next/` *and* Method is
   `POST` → *Rate Limit*, fixed window, 60 s, 60 requests, key *IP*, action *Deny*. Hobby allows one
   such rule.
5. **Settings → Git**: leave *Preview deployments* on (they are useful once item 2 is done).
6. Consider moving to **Pro** before artist data is collected.

**GitHub** (`github.com/aryavsparihar/pat-and-jk-co`)

1. **Settings → Branches → Add branch ruleset** for `main`: *Require a pull request before
   merging* (0 approvals is fine for a one-person team; it is the CI that matters), *Require status
   checks to pass* → select **CI / verify** (it appears after the workflow has run once), *Block
   force pushes*. Leave yourself as a bypass actor if you want to be able to push directly in an
   emergency.
2. **Settings → Code security**: enable *Dependabot alerts* and *Dependabot security updates*
   (`.github/dependabot.yml` handles the routine version updates).
3. **Settings → Secrets and variables → Actions**: nothing needed; CI uses throwaway values.

**Neon**

1. Check the plan and its restore window (**Settings → Storage / History retention**). Move to
   Launch and set 7 days before Phase 3 goes live.

**Accounts you control**

1. Rotate the super admin password.
2. Turn on two-factor authentication for Vercel, Neon, GitHub, Resend and GoDaddy if any are
   still without it.
3. **Enquiries → Forms → Contact** and **Collaborate → Emails**: check each form notifies an inbox
   (`hello@pjk.co.in`, or whichever should hear about enquiries).
4. **`PAYLOAD_SECRET` length** (Vercel → Environment Variables): if it is under 32 characters, the
   logs will say so once per cold start. Replace it with `openssl rand -hex 32` when convenient;
   the only effect is that everyone signed in has to sign in again.

**Optional, needs an account (ask first)**

- Sentry for error tracking (section 11).
- Better Stack or UptimeRobot for uptime checks against `/api/health` (section 12).
- Cloudflare Turnstile for the public forms (Phase 4). Done: the code request and the public
  forms (docs/SECURITY.md).

---

# Security and launch-readiness pass, 14 October 2026

Every item checked against the code and, where it can be seen from outside, against pjk.co.in
(read-only requests only). Each is **verified** (already sound; the evidence is a file and line, a
test, or a command and its result) or **fixed** (the commit). **By hand** items need an account
only the owner holds; they are collected in [LAUNCH.md](LAUNCH.md). Nothing that was already sound
was rebuilt.

## 1. Passwords and staff sign-in

| Item | State | Evidence |
| --- | --- | --- |
| Passwords hashed with a slow, salted hash | verified | Payload: PBKDF2-SHA256, 600,000 iterations, random salt (`node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js:4-5,41`) |
| Password rules applied on every path, reset included | fixed | `95f5c6a`; test *resets a password once, within the hour, by the rules* (`tests/int/staff-auth.int.spec.ts:100`) |
| Breached passwords refused (Have I Been Pwned, k-anonymity, padded) | fixed | `4f86294`; `src/security/breachedPassword.ts`; tests at `staff-auth.int.spec.ts:28-76`. If the service is down the password is allowed and the failure logged, so an outage cannot lock staff out |
| Reset links single use, one hour, end every session | verified | `forgotPassword.js:71` (one hour), `resetPassword.js:64` (spent on use); test `staff-auth.int.spec.ts:100` |
| Reset answers the same for unknown addresses | verified | test `staff-auth.int.spec.ts:174` |
| Reset requests limited | fixed | `4bcc1f4`: 3 an hour per address, 10 per IP (`src/collections/Users/index.ts:191-192`) |
| Lockout after wrong passwords, logged, account holder emailed | fixed | 5 attempts, 15 minutes (`Users/index.ts:57-58,110-111`) was already there; `57e787a` adds the log and the email; test `staff-auth.int.spec.ts:205` |
| Members have no passwords | verified | `src/collections/Members.ts:48` (`disableLocalStrategy`); members sign in with emailed codes only |
| A member who has lost their mailbox can be recovered | fixed | `60ddb30`: a KYC reviewer changes the address with a reason, every session ends, both addresses are told; the field cannot be edited any other way. ADMIN_GUIDE.md, *When an artist has lost access to their email*. Tests `tests/int/member-recovery.int.spec.ts:101-141` |
| No auth secret in the browser | verified | Built client bundle (`.next/static`, 124 files) searched for every secret's name and for the local values of DATABASE_URL, PAYLOAD_SECRET, CRON_SECRET, PREVIEW_SECRET and RESEND_API_KEY: no values. The only name found is `BLOB_READ_WRITE_TOKEN` inside the Vercel Blob library's own code, which reads it on the server and finds nothing in a browser. The only `NEXT_PUBLIC_` values are the site URL and the Turnstile site key, both public by design |

## 2. Sessions and cookies

The full cookie inventory is in [SECURITY.md](SECURITY.md#cookies).

| Item | State | Evidence |
| --- | --- | --- |
| Staff session: Strict, 30 minutes idle, 12 hours at most | fixed | `9460499`; `Users/index.ts:83-93,170-175`; test `staff-auth.int.spec.ts:283` |
| Admin gate: 30 minutes idle | fixed | `dd0b6f6`; `src/security/constants.ts:20`, renewed by `src/proxy.ts:46` |
| Member session: Lax, a day idle, 30 days at most | fixed (idle) / verified (absolute, Lax) | `a55b2e9`; `constants.ts:62-64`; `src/security/memberSession.ts:73-85` |
| Recent sign-in (30 minutes) for identity details, payout details, email change, data requests | fixed | `fef0e6b`; `src/members/recent.ts:15`; tests `tests/int/recent-sign-in.int.spec.ts:85-116` |
| New session ID at every sign-in | verified | members: a fresh random `sid` per sign-in (`memberSession.ts:127`); staff: Payload adds a new session id to the JWT at each login |
| Sign-out ends the session on the server | verified | members: the row is marked revoked and never accepted again (`memberSession.ts:175,206`); staff: Payload removes the session from the account (`node_modules/payload/dist/auth/operations/logout.js:46-49`) |

Files changed for this section: `src/collections/Users/index.ts`, `src/security/constants.ts`,
`src/security/gateToken.ts`, `src/proxy.ts`, `src/security/memberSession.ts`,
`src/collections/MemberSessions.ts`, `src/members/recent.ts`, the step-up routes under
`src/app/(frontend)/next/members/step-up/`, `src/components/onboarding/StepUp.tsx` and the pages
that use it, and two migrations (`20261013_170910`, `20261013_171821`).

## 3. Routes and responses

| Item | State | Evidence |
| --- | --- | --- |
| Inventory of every route, with who may call it | fixed | `e8c1bbd`: `tests/e2e/routes.e2e.spec.ts` holds the table; summary in [SECURITY.md](SECURITY.md#every-route) |
| Each route tried with no session, an expired one, a member, an editor and an admin | fixed | same test; 9 of 9 pass, also against a production build running as the least-privileged database role |
| One member cannot reach another's records (IDOR) | verified | the same test sets up a second member and checks that every collection returns only the caller's own rows (`tests/e2e/routes.e2e.spec.ts:385`), that another member's work is not found by its address (`:285`), and that another member's records cannot be changed even by ID (`:416`) |
| Responses carry only what the page uses | fixed | `56dfb0d` (own application), `5842ef1` (public pictures no longer name the member) |
| Payload's preferences endpoints refuse members cleanly | fixed | `c539994` |
| Upload-token endpoint checks the session first | fixed | `09c3cf1` |
| Secrets compared in constant time, never matching an empty one | fixed | `166bfbc`; `src/security/secrets.ts` |
| Public endpoints and how each is protected | verified | [SECURITY.md](SECURITY.md#every-route) lists each with its origin check, Turnstile, form token, honeypot and rate limit |
| Visit counter cannot be inflated | fixed | `d760426`: once per visitor per 20 minutes across instances, only from our own pages |

## 4. Database

| Item | State | Evidence |
| --- | --- | --- |
| Credentials server-only | verified | bundle search under section 1 |
| Owner and app role split; migrations run as the owner | fixed | `6531024`: group role `pjk_app_access`, `DATABASE_URL_MIGRATE` for migrations (`scripts/vercel-build.mjs`) |
| The site refuses to start as the owner | fixed | `checkDatabaseRole` (`src/security/databaseRole.ts`, called from `src/payload.config.ts`): in production with `DATABASE_URL_MIGRATE` set it refuses an owner, superuser, RLS-bypassing or table-creating role |
| RLS on every table, a policy for the app role only | fixed | `src/migrations/20261013_185333_app_role_and_rls.ts:49-52`. The security log is append-only for the app; the migrations table read-only |
| FORCE RLS | not used, on purpose | it would apply to the owner too and stop migrations; the owner is used only by the build. RLS is a second guard behind Payload's own access rules, which the route tests cover |
| CI checks it | fixed | `pnpm check:database` in CI against a fresh database (`scripts/check-database-access.ts`) |
| Neon and Vercel steps | by hand | docs/SETUP.md, *Database roles*; LAUNCH.md |
| TLS to Neon | verified | the connection strings end `sslmode=require`, and Neon refuses unencrypted connections. The build log's `pg` notice says that today `require` is treated as `verify-full`, so the certificate is checked too; a future `pg` will make `require` weaker, so SETUP.md now says to write `sslmode=verify-full`, which keeps today's behaviour and silences the notice |
| Neon IP allow-list | not available | needs Neon's Scale plan; Vercel's addresses change anyway. The connection string is the secret (paid recommendations, below) |

## 5. HTTPS

| Item | State | Evidence |
| --- | --- | --- |
| HTTP redirects to HTTPS | verified | `curl -I http://pjk.co.in` and `http://www.pjk.co.in`: 308 to https |
| HSTS | verified | `next.config.ts:68`; live header `max-age=63072000; includeSubDomains; preload` |
| upgrade-insecure-requests | verified | `next.config.ts:52` (production only; WebKit applies it to localhost) |
| No mixed content | verified | 12 public pages fetched and searched for `http://` sub-resources: none |
| HSTS preload | ready, not submitted | hstspreload.org reports *eligible, no errors*. Submitting is a one-way decision for every subdomain, so it is listed for you in LAUNCH.md |

## 6. Secrets

| Item | State | Evidence |
| --- | --- | --- |
| Nothing real ever committed | verified | gitleaks over every commit: no real credential. Its one finding was a made-up token in this branch's own redaction test (`37b13cf`), now built at runtime and its old line listed in `.gitleaksignore` with the reason (`6f28061`). Trivy over the working tree: only the Vercel OIDC token in `.env.local`, which is gitignored and never committed. **No key needs rotating** |
| Env files ignored | verified | `.gitignore:5,39`; the only tracked env files are `.env.example` (placeholders) and `test.env` (no secrets) |
| No secret behind `NEXT_PUBLIC_` | verified | section 1 |
| Secret scanning in CI | fixed | `3487b7d`: gitleaks over the whole history on every push, PR and weekly |

## 7. Environment variables

| Item | State | Evidence |
| --- | --- | --- |
| A table of every variable | fixed | `cf32f62`: docs/SETUP.md, *Environment variables* |
| Boot check covers every variable | fixed | `src/env.ts`; `CRON_SECRET` and `PREVIEW_SECRET` now required in production |
| `.env.example` complete; CI keeps code, example and boot check in step | fixed | `pnpm check:env` (`scripts/check-env-vars.ts`) |
| Matches Vercel (names only) | verified | Production and Preview hold every required name. Missing: `DATABASE_URL_MIGRATE` (added with the role split, by hand). Unused in Vercel: `BLOB_WEBHOOK_PUBLIC_KEY`, `KYC_WEBHOOK_PUBLIC_KEY`. Vercel manages them with the Blob store connections and they cannot be removed without disconnecting the stores; public keys, read by nothing, ignored by the boot check and CI (`tests/int/env.int.spec.ts`) |

## 8. Logging

| Item | State | Evidence |
| --- | --- | --- |
| No personal data in logs | verified | redaction on the logger (`src/observability/redact.ts:37-40`), tests in `tests/int/redact.int.spec.ts` |
| No credentials in logs | fixed | `37b13cf`: connection strings, bearer tokens, JWTs and service keys redacted from any line |

## 9. Errors

| Item | State | Evidence |
| --- | --- | --- |
| No raw error reaches a visitor | verified | API errors are generic (`tests/int/public-error.int.spec.ts`) |
| Branded error pages | fixed | `50efcae`: per-site error page and a global one |
| Database unreachable | fixed | `70deb86`: a plain 503, tested |
| Session runs out mid-application | fixed | `ea9afda`: sign in again in place, nothing lost |
| Unhappy paths in a real browser: malformed input, slow and offline network, double-click, back button, session expiry, upload failure and cancel, empty states | fixed | `c29d50c`: `tests/e2e/unhappy.e2e.spec.ts`, 7 of 7 pass |
| Outside services failing: Resend, Turnstile, IFSC lookup, Blob, database | fixed | `tests/int/outside-failures.int.spec.ts` |

## 10. Input validation

| Item | State | Evidence |
| --- | --- | --- |
| Strict schemas on every input | verified | zod schemas in `src/members/forms/schemas.ts` and `src/kyc/schema.ts`, applied on the server for every step and form |
| Every free-text identity field capped | fixed | `ca50111` |
| Names in any script | verified | name fields accept any script: tests with Devanagari and Urdu names (`tests/int/forms.int.spec.ts:306`, `tests/e2e/unhappy.e2e.spec.ts:91`) |
| No SQL, shell or HTML injection | verified | Drizzle and Payload parameterise every query; the only raw SQL uses tagged templates; no shell calls with user input; React escapes output; the three `dangerouslySetInnerHTML` uses carry JSON-LD with every `<` escaped (`src/components/JsonLd.tsx:32`) and constant SVG icons from the repository (`BrandSvg.tsx`, `BrandSocialLinks.tsx`), never text a visitor or editor typed (Semgrep, section 16) |
| Uploads | verified | the format is read by decoding the file, not from its name; 25 MB and a pixel limit; every picture re-encoded as a fresh JPEG with EXIF and GPS dropped (`src/members/portfolio.ts:61-100`); tests in `tests/int/onboarding.int.spec.ts` |

## 11. Dependencies

| Item | State | Evidence |
| --- | --- | --- |
| pnpm audit, Trivy and OSV | fixed | `ec48fa1` (sharp 0.35.5), `bc80103` (source-map-js 1.2.2). One left: `braces` inside a build-time tool, no fixed version that the tool accepts; allow-listed with a review date of 1 December 2026 |
| Unused packages (knip) | fixed | `6642e5e`, `93aebca`, `2347d69`, `7f76238` |
| Deprecated packages | known | ESLint 9 is deprecated; ESLint 10 breaks `eslint-plugin-react`, so it stays until that plugin catches up. Dependabot will propose it |
| New releases wait a week | fixed | `c1ac123`: pnpm `minimumReleaseAge`, Dependabot cooldown |
| Payload packages move together | verified | every `@payloadcms/*` and `payload` pinned to 3.90.2 |

Commands: `pnpm audit --audit-level high`, `trivy fs --scanners vuln,secret,misconfig .`,
`osv-scanner scan source -r .`, `pnpm dlx knip`.

## 12. Build health

| Item | State | Evidence |
| --- | --- | --- |
| Vercel build warnings | fixed | `5357c63` (engines, npm setting). The `pg` SSL notice is harmless (section 4) |
| CI fails on build or lint warnings, with an allow-list | fixed | `42d5511`: `scripts/check-build-log.mjs`, `build-warnings.allow`, ESLint `--max-warnings 0` |
| Same Node, pnpm and build as production | fixed | Node 24 pinned, CI runs `pnpm vercel-build` |

## 13. Content readiness

| Item | State | Evidence |
| --- | --- | --- |
| Check that the live site's records exist | fixed | `529c6c0`: `pnpm check:content`; staff-only `/api/health?deep=1` |
| Run against production | by hand | needs the production connection string or a signed-in staff browser; LAUNCH.md |
| Graceful when data is missing | verified | `tests/e2e/unhappy.e2e.spec.ts` renders an empty site |

## 14. Rollback

| Item | State | Evidence |
| --- | --- | --- |
| A tag and release for each production deploy | fixed | `ce86189`: `.github/workflows/release.yml` |
| Runbook | fixed | `a8ac02e`: docs/RUNBOOK.md. Vercel screenshots not included: the browser here is not signed in to Vercel, and signing in is yours to do |
| Migrations additive, enforced in CI | fixed | `a8ac02e`: `scripts/check-migrations.mjs`, exceptions in `migrations-allow.txt` with a reason |
| Neon snapshot before launch and risky migrations | fixed | RUNBOOK.md section 4; LAUNCH.md |

## 15. Load testing

| Item | State | Evidence |
| --- | --- | --- |
| k6 scripts for browsing, applying and a health burst | fixed | `5d78329`: `load-tests/`, docs/LOAD_TEST.md; local dry run passes |
| Run on a Preview deployment | waiting | needs a Protection Bypass for Automation secret, which only you can create. The tests fit under the Firewall rule as it is; no setting needs changing |

## 16. Security in CI

| Item | State | Evidence |
| --- | --- | --- |
| Trivy, failing on HIGH and CRITICAL with a fix; allow-list with reason and date | fixed | `3487b7d`: `.github/workflows/security.yml`, `.trivyignore.yaml` |
| pnpm audit | fixed | same workflow |
| Code scanning | fixed | Semgrep community rules (CodeQL needs GitHub Advanced Security on a private repository) |
| SBOM | fixed | CycloneDX, kept 90 days as a workflow artifact |
| Actions pinned to commits, least permissions | verified / fixed | every action pinned to a full SHA; all three workflows default to `contents: read`, and only the release job may write (tags and releases) |
| Required checks and Vercel holding deploys until they pass | by hand | [SECURITY.md](SECURITY.md#the-gatekeeper); LAUNCH.md |
| Security headers still in place | verified | live pjk.co.in: CSP, HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera allowed only on the artist application), `Cross-Origin-Opener-Policy` |

## 17. Monitoring

| Item | State | Evidence |
| --- | --- | --- |
| Security log records sign-ins, code requests, lockouts, rate-limit hits, KYC reveals and refusals | fixed | sign-ins and lockouts `57e787a`; refusals and rate limits `b581468`; code requests and KYC reveals (`kyc-revealed`, `kyc-document-opened`) were already logged |
| Free alert email to tech@pjk.co.in | fixed | `b581468`: `src/security/alerts.ts`, through Resend (already in use), at most once an hour per kind |
| Turnstile active in production | verified | the live sign-in page loads Cloudflare's script with a real site key; production refuses to start with the test keys (`src/env.ts`) |
| App rate limits active | verified | Postgres-backed, tested (`tests/int/rateLimit.int.spec.ts`); 19 load-test code requests from one IP logged and limited as expected |
| Firewall rule active | recorded | published 4 October 2026 (LAUNCH.md). It cannot be confirmed from outside without tripping it on production, so it is listed for a look in the Vercel dashboard |
