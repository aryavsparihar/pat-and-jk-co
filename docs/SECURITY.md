# Admin security

How the admin panel is protected, and what to do when something goes wrong.

## Getting in takes three things

1. **A company mailbox.** `/admin` and every authentication API are unreachable until a one-time
   code, emailed to an `@pjk.co.in` address, has been entered at `/admin-access`. This is checked in
   `src/proxy.ts` before any admin route runs, so an outsider cannot even see the sign-in screen —
   and passwords cannot be guessed, because the password form is behind the gate.
2. **An approved account.** Codes are only sent to addresses that already have an **active** account.
   New people request access at `/admin-access`; a super admin approves it under
   **Administration → Access requests**, which creates the account and emails them a link to set
   their own password. Until then, nothing is sent and nothing can be signed into.
3. **Their password.** Payload's own sign-in, behind the gate. The gate records which address the
   code was sent to, and a sign-in is refused if it does not match — so a code obtained for one
   account cannot be used to try passwords against another.

## The rules in detail

| | |
| --- | --- |
| Who can hold an account | Only `@pjk.co.in` addresses (enforced on the account, at the gate, and at sign-in) |
| Codes | 6 digits, single use, expire in 10 minutes, 5 attempts, stored only as a keyed hash |
| Code requests | 5 per address per hour, 20 per IP per hour |
| Access requests | 3 per IP per day; never create an account by themselves |
| Passwords | At least 12 characters with upper, lower, number and symbol; may not contain the address or a common phrase; refused if it has appeared in a data breach (Have I Been Pwned, which is sent only the first five characters of the password's hash). The same rules apply when a password is reset |
| Password resets | The link works once, for an hour, and ends every session. 3 requests an hour per address, 10 per IP; an unknown address gets the same answer and nothing is sent |
| Wrong passwords | Account locks for 15 minutes after 5 attempts (Payload). Every failed sign-in is logged; the lock is logged once and the account holder is emailed |
| Sessions | The gate closes after 30 minutes without activity and after 12 hours at most; the admin session ends after 30 minutes without activity and is never extended past 12 hours from sign-in |
| Cookies | httpOnly, SameSite=Strict, Secure in production ([every cookie](#cookies)) |
| Suspending someone | **Administration → Users → Status: Suspended.** Blocks sign-in at once, keeps their work |
| Audit | Every request, failure, approval and block is written to **Administration → Security log** (read-only, super admins only) |
| Account enumeration | Asking for a code returns the same answer whether or not the address exists |

Roles stay as before: **super admin** (everything, including users and domains) and **editor**
(content for their brands only). Only a super admin can change a role, a status, or a brand
assignment.

## The rest of the site

| | |
| --- | --- |
| Hostnames | The `Host` header is validated as a bare hostname before it reaches the brand rewrite (`src/utilities/host.ts`). Anything else is served the default brand. **Do not loosen this** — the header is interpolated into an internal path, and a slash or a `..` in it used to walk the rewrite into `/admin`, past the sign-in gate |
| Response headers | CSP (stricter on the public site than in the admin), HSTS, `nosniff`, `SAMEORIGIN`, COOP, a restrictive `Permissions-Policy` — all in `next.config.ts` |
| Uploaded files | Served with `sandbox` and `default-src 'none'`, so an uploaded SVG cannot run script against the site |
| Public forms | Cloudflare Turnstile (below), honeypot, 5 submissions per IP per 10 minutes (counted in Postgres, so the limit holds across every serverless instance; see `src/security/rateLimit.ts`), fields checked against the form definition (unknown fields dropped, required fields enforced, dropdowns limited to their own options), values capped at 5 000 characters, brand assigned from the form rather than from the request |
| Enquiries | Readable only by signed-in users of the owning brand; never by the public |
| Drafts | Filtered out for anyone not signed in, including through `?draft=true` on the API |
| Trusted origins | Payload's CSRF and CORS lists and the member endpoints' `Origin` check share one list (`trustedOrigins` in `src/utilities/getURL.ts`). Production trusts https://pjk.co.in and `ALLOWED_ORIGINS` only. A preview deployment also trusts its own `VERCEL_URL` and `VERCEL_BRANCH_URL`, so saving in its admin works; those are never trusted in production. `tests/int/origins.int.spec.ts` checks both |
| Dependencies | `pnpm audit --prod` is clean; `pnpm-workspace.yaml` pins patched versions of transitive packages |

There are two policies. The public site's `script-src` is `'self' 'unsafe-inline'`: no
`'unsafe-eval'`, no outside script host, and `connect-src 'self'`. Only `/admin` adds
`'unsafe-eval'`, `https://cdn.jsdelivr.net` (the code editor fetches itself from there) and outbound
HTTPS for uploads straight to Vercel Blob. `'unsafe-inline'` stays on both because Next.js inlines
its bootstrap scripts; replacing it with a nonce would mean rendering every page per request
instead of serving it from the CDN (see [AUDIT.md](AUDIT.md#8-security)). `Cross-Origin-Opener-Policy:
same-origin` is set everywhere.

If something in the admin panel ever fails to load, the CSP in `next.config.ts` is the first thing
to check: the browser console names the directive that blocked it.

**Cloudflare Turnstile** stands in front of the code request (signing in, and the start of
both applications) and the public forms. The widget stays out of sight unless Cloudflare wants a
box ticked; the server checks every token with Cloudflare's siteverify (`src/security/turnstile.ts`)
and refuses one that is missing, forged, used before, older than five minutes, earned on a
different form (the action), or earned on a different site (the hostname). Cloudflare spends a
token the first time it is verified, so each works once. `tests/int/turnstile.int.spec.ts` proves
each case, against a stand-in that behaves as Cloudflare documents, and through the code request
itself. Only the secret and the
token are sent to Cloudflare, never the person's IP address or anything they typed. If Cloudflare
cannot be reached the request goes ahead and the reason is logged: the honeypot, the form-start
token and the rate limits still apply. Without `TURNSTILE_SECRET_KEY` (a developer's machine, the
tests) the check is skipped; production refuses to start without both keys, or with Cloudflare's
test keys, which previews use and which pass everyone. The staff sign-in
gate is not covered: its sign-in model is unchanged. When the check cannot run (Brave Shields
and privacy extensions often block it) or does not pass, the form sends nothing and says so, with
what to do: allow challenges.cloudflare.com or turn the shield off for the site, and an email
address that needs no check. It never waits silently: the script gets 10 seconds to load and the
check 20 seconds to answer, except while Cloudflare is showing a box to tick.

## Staff and members

Payload sets `req.user` for anyone signed in through any auth collection, so "signed in" never
decides access here. Two layers make sure of it:

1. Every rule of ours asks `isStaff(user)` (`src/access/roles.ts`), which checks the collection
   Payload stamped on the user, not just that a user exists.
2. `src/access/memberGuard.ts` wraps **every** collection's access after Payload has assembled the
   configuration, including Payload's internal collections and the form builder's, which default
   to "anyone signed in". For a signed-in user who is not staff, each rule is evaluated as though
   nobody were signed in, and admin-panel access is refused. Collections built for members are
   listed in `MEMBER_COLLECTIONS` and must enforce ownership in their own rules.

`tests/int/access.int.spec.ts` signs in as a non-staff user and checks both layers.

**Both cookies at once.** A browser can carry a staff session and a member session together (a
member of staff who has tried the artist form). Payload stops at the first auth strategy that
recognises someone and runs its staff JWT strategy last by default, which let the member win.
`src/security/strategyOrder.ts` moves it to the front at start-up, so the staff session wins in
`/admin` and the staff APIs; with only a member cookie nothing changes, and members still never
reach `/admin`. `tests/int/session-precedence.int.spec.ts` checks both.

## Members

Artists and partners sign in with a one-time code and nothing else (the page, `/collaborate/signin`, comes with the onboarding).
The endpoints live under `/next/members/`.

| | |
| --- | --- |
| Codes | The same implementation as the staff gate (`src/security/challenges.ts`): 6 digits, 10 minutes, single use, 5 attempts, keyed hash salted per challenge, constant-time compare. Attempts are reserved atomically before comparing, so parallel guesses cannot exceed five |
| Code requests | 5 per address and 20 per IP per hour, counted in Postgres |
| Verification | 30 per IP per hour; an address with 10 wrong codes in an hour is **locked** for the rest of the hour, even against the right code, and the lockout is logged |
| Enumeration | A sign-in request gets the same reply whether or not the address is registered; an application request always sends a code, so it reveals nothing either |
| Sessions | `pjk_member` cookie: httpOnly, SameSite=Lax, Secure in production, signed with `MEMBER_SESSION_SECRET`. A day from last use, never more than 30 days. A new session on every sign-in (the old one is ended). Signing out marks the session ended in the database, so the cookie is useless even if kept |
| Recent sign-in | Identity details, payout details, changing the email address and data requests need a sign-in within the last 30 minutes. Otherwise the page asks for a fresh code, sent to the member's own address, and carries on where it was The database holds only a keyed hash of the session secret, and no IP address |
| Sign out everywhere | Ends every session of the member at once. Suspending a member does the same |
| Origin | Every state-changing member endpoint refuses requests whose `Origin` is not the site's own |
| Admin | Members can never reach `/admin`: their collection refuses admin access, the member guard refuses it again, and the staff gate stands in front of it |
| Audit | Code requests, sends, failures, lockouts, sign-ins, sign-outs, creations, decisions and issued member IDs all go to the security log; decisions record the staff member who took them |

**If member accounts are compromised:** rotate `MEMBER_SESSION_SECRET` in Vercel and redeploy.
Every member session ends at once; staff are unaffected.

The staff gate now shares this code-checking implementation. Its rules and messages are unchanged,
but two flaws went with the move: parallel guesses could each be compared before the attempt limit
applied, and the failure response was a single shared object, which can only be read once.

## Identity and payout details (KYC)

Encrypted field by field under a key kept only in the environment, shown masked, revealed only to
KYC reviewers with a logged reason, and deleted on a schedule. The whole design, its retention
rules and its threat model are in [KYC.md](KYC.md).

### Aadhaar

Every artist gives a **PAN**: we need it to pay them and for tax. They also give a second ID with
an address: by default a **masked e-Aadhaar**, the PDF UIDAI issues with the first eight digits
hidden, with its last four digits; or, as an equal choice with no extra steps, a passport, voter
ID or driving licence, checked by hand. A private company may not make Aadhaar compulsory, which is
why the choice is a real one. We never accept, store or display a full Aadhaar number. Why:

- The Aadhaar Act limits how Aadhaar numbers may be collected and used, and UIDAI requires anyone
  who stores them to keep them in a separate, specially secured Aadhaar Data Vault. We are not set
  up for that, and have no need to be: we do not authenticate anyone with Aadhaar. (Our lawyer or
  CA should confirm this reading along with the privacy notice.)
- Four digits and a masked copy are enough for a person to check that the document matches the
  person and the address, which is all we use it for.
- A number we never hold cannot leak. The server refuses twelve digits with a message that does
  not repeat them, and the log redaction would remove them in any case. If an uploaded PDF turns
  out to be unmasked, the check deletes it rather than keep it.

**The e-Aadhaar PDF's password** opens the file once, in memory, for the advisory signature and
details check (docs/KYC.md#verification). It is never stored, never logged (the logger drops any
`password` field, and request bodies are never logged), and never sent back.

**Offline e-KYC (not built).** UIDAI's signed offline e-KYC (the XML in a ZIP opened with a share
code, or the Secure QR) would let us confirm a name, date of birth and address without ever seeing
the Aadhaar number. It is not used yet: since the 2025 amendments to the Aadhaar (Authentication
and Offline Verification) Regulations, at least the XML route needs registration with UIDAI as an
Offline Verification Seeking Entity, and that is a decision for the business and its lawyer first.

## The member portal

- Approved artists edit their profile and works through `/next/members/portal/*` only; the
  `artworks` collection refuses members outright.
- Artists' pictures are private: kept in the private Blob store (never the public one), readable by
  staff and their owner only, approved or not, and served only through Payload's file route with
  `Cache-Control: private` and a sandboxing policy. Uploads are made smaller in the browser and
  pass through the server, which checks and re-encodes them before anything is stored; nothing goes
  through public storage on the way. Nothing reaches the public without a member of staff
  approving it.
- An artist's Google Drive folder link is accepted only as a `drive.google.com` folder link,
  stored in one canonical form, and set only by its artist through the portal (Payload's API
  cannot change it; staff can in the admin). It is shown to staff and the artist only. The folder
  itself is shared by the artist as "Anyone with the link"; we never ask for Drive access.
- Pictures staff add in the admin are checked, re-encoded and renamed exactly as an artist's
  were. Members cannot create pictures through Payload's API.
- Changing the email address needs a code sent to the **new** address; the old address is told,
  and every other device is signed out. A pending change is bound to its own code, so a code for
  anything else cannot complete it.
- A member can see and sign out each of their devices, and only their own.
- Bank details are not part of the application. They are asked for only when a sale needs a
  payout: staff press **Request payout details**, and the email that follows only links to the
  account, never asks for bank details and never carries any. The artist adds them there after a
  fresh code; they are never accepted by email.
- A new bank account is not used until staff approve it, after a ₹1 test transfer. The artist is
  emailed at once with a **This was not me** link, valid once; it stops it, signs them out
  everywhere and tells staff (docs/KYC.md#payout-details).

## Logs

Every log line goes through one logger (`src/observability/logger.ts`): Payload's, the plugins'
and ours. In production it writes JSON, one object per line; locally it stays readable. Before
anything is written, `src/observability/redact.ts` removes email addresses, phone numbers, PAN,
IFSC, and any run of 9 to 18 digits (Aadhaar and bank account numbers), wherever they appear: in
the message, in fields, inside error messages and stacks. Values under keys such as `password`,
`otp`, `token`, `pan` or `accountNumber` are dropped whatever they contain. A test logs a PAN every
way it can and checks it never comes out. Credentials are removed too: connection strings with a
password, bearer tokens, JWTs and service keys (Resend, Vercel Blob, Neon), wherever they appear.

Unhandled errors in pages and routes are logged the same way by `src/instrumentation.ts`, with the
query string stripped from the path.

The redaction is a safety net, not permission. Two rules still apply to new code:

- **Never put personal data in an error message.** Next.js prints raw errors as well, outside our
  logger. Say *which* record (an id, an application reference), never *whose* details.
- **Never log a request body** from a form that collects personal data.

## Rate limits

`src/security/rateLimit.ts` is the one place limits are counted. Each check is a single atomic
Postgres statement on the `rate_limits` table, so concurrent requests cannot slip past it and every
serverless instance sees the same count. What is counted (an IP, an email) is stored only as an
HMAC under `PAYLOAD_SECRET`; the table never holds an address. Server code using the Local API is
not limited.

Outside the app, one Vercel Firewall rule (the most Hobby allows) adds a coarse per-IP ceiling:
100 POSTs to `/next/` per IP per minute, then refused (published 4 October 2026; see
[AUDIT.md](AUDIT.md#9-rate-limiting)). The load tests stay under it ([LOAD_TEST.md](LOAD_TEST.md)).

## Monitoring and alerts

The security log (**Administration → Security log**, super admins only) records staff sign-ins,
failed sign-ins and lockouts; every code requested, sent, verified or refused; member sign-ins and
sign-outs; every reveal of identity details and every identity document opened; every refusal of a
signed-in person by an access rule (`access-refused`, with the path); and the first hit of each
rate limit in its window (`rate-limited`). The app can add to it but never change or delete it
(the database itself enforces that for the app's role).

`src/security/alerts.ts` emails tech@pjk.co.in (or `TECHNICAL_INBOX`) when, within an hour, there
are more than 20 failed staff sign-ins, 30 rate-limit hits, 3 lockouts or 50 refused requests. At
most one email an hour for each kind, through Resend, which the site already uses: nothing to sign
up for. Each alert is itself logged (`alert-sent`). An alert means look at the security log, not
panic: a busy launch day can trip the rate-limit one.

## Cookies

Every cookie the site sets. None is used for tracking or advertising, so there is no consent banner.

| Cookie | Set by | For | Lifetime | Flags |
| --- | --- | --- | --- | --- |
| `pjk_member` | signing in with a code (`src/security/memberSession.ts`) | a member's session | a day from last use, 30 days at most | HttpOnly, SameSite=Lax, Secure |
| `pjk_admin_gate` | the admin gate (`/admin-access`) | proves a staff code was entered | 30 minutes idle, 12 hours at most | HttpOnly, SameSite=Strict, Secure |
| `payload-token` | Payload's staff sign-in | the staff session | 30 minutes idle, 12 hours at most | HttpOnly, SameSite=Strict, Secure |
| `payload-theme`, `payload-lng` | the admin panel | the admin's light/dark and language choice | up to a year | not secret; read by the admin's own script |
| `__prerender_bypass` | Next.js, at `/next/preview` | shows drafts to staff while previewing | the browser session | HttpOnly, SameSite=None, Secure |

The member cookie is Lax rather than Strict so that following a link in an email to the account
page arrives signed in. Every state-changing member request also has its `Origin` checked.

## Every route

The full table, with who may call each route and each collection, is the route test
(`tests/e2e/routes.e2e.spec.ts`): it calls every one as nobody, an expired session, a member, an
editor and an admin, and fails if any answers someone it should not. Adding a route without adding
it to the table fails the test too.

**Public endpoints, and what protects each.** Everything else needs a member or staff session.

| Endpoint | Protection |
| --- | --- |
| Pages, `robots.txt`, `sitemap.xml` | read only; drafts never shown without a staff preview |
| `GET /api/<public collection>` (pages, posts, ventures, people, media, settings, forms) | read only, published content only, `maxDepth` 4, GraphQL off |
| `POST /api/form-submissions` (contact and enquiry forms) | Turnstile, honeypot, 5 per IP per 10 minutes, fields checked against the form and capped (`src/collections/FormSubmissions/overrides.ts`) |
| `/api/health` | database ping only; the `?deep=1` content check is staff only |
| `/next/members/request-code` | origin check, Turnstile, honeypot, form-start token, 5 per address and 20 per IP an hour; same reply whether or not the address exists |
| `/next/members/verify-code` | origin check, 5 tries a code, 30 per IP an hour, address locked after 10 wrong codes in an hour |
| `/next/members/session`, `/next/members/sign-out` | read or end only the caller's own session |
| `/next/members/kyc/bank-change/cancel` | a single-use token from the email, valid once |
| `/next/admin-gate/request-code`, `verify-code`, `request-access` | the staff gate's own limits (above) |
| `/next/visits` | origin check; counts a visitor once in 20 minutes |
| `/next/preview` | `PREVIEW_SECRET`, compared in constant time, plus a staff session |
| `/next/exit-preview` | only clears the preview cookie |
| `/next/cron/kyc-purge`, Payload's job runner | `CRON_SECRET`, compared in constant time; an unset secret never matches |

## Database access

The site connects as `pjk_app`, a role with no ownership and no right to create or alter tables;
migrations run during the build as the owner, through `DATABASE_URL_MIGRATE`. Every table has
Row-Level Security on, with one policy that lets the app role do its work and nobody else
anything, and the security log is add-only. In production the site refuses to start if it is
connected as the owner, a superuser, or any role that bypasses RLS or can create tables. Setting
the role up is in [SETUP.md](SETUP.md#database-roles); `pnpm check:database` checks it, and runs in
CI. FORCE RLS is not used: it would bind the owner too and stop migrations, and the owner is only
used by the build.

## Deleting someone

Nobody is removed outright: a member's applications, sessions, pictures, KYC and works, and a staff
member's decisions, all point at them, and removing the row would break those records (the
database refuses for members). Deleting someone erases their personal details and keeps the record
(`src/people/erase.ts`), so every link stays valid and shows a placeholder: *Deleted artist
(AT000012)*, *Deleted partner (PT000003)*, *Deleted applicant (A-7K3Q9X)*, *Deleted staff
(ST-0007)*. IDs come from sequences and the erased record keeps its own, so none is ever issued
again.

- Only a super admin, from the record's **Delete this person** panel, with the ID typed out and a
  reason (`POST /api/members/:id/erase`, `/api/users/:id/erase`); never their own account or the
  last super admin. A member's own request (`/next/members/data-request`) is recorded on their
  record and carried out the same way, so admin deletions and DPDP requests behave identically.
- Erased: name, email (replaced by an `@erased.invalid` address, which cannot receive mail), phone,
  addresses, profile, portrait, every application answer, sessions, sign-in codes and form
  messages; for staff, the password, brands and sessions. Approved works are archived and kept,
  with their pictures and approved snapshot, as the record; works never approved are removed.
- KYC is purged with the existing purge (files, then rows) unless a legal hold is in force; then
  it stays, encrypted, and the record says what was kept and why.
- The database writes happen in one transaction; the member is emailed only once it has gone
  through. An erased record can never be edited again, and an erased member or account can never
  sign in.
- The security log is append-only for the app. One function, `erase_from_security_log`, may
  replace a deleted person's addresses in it with their placeholder: it runs with the owner's
  rights, refuses anyone whose record is not actually erased, never removes an entry, and adds its
  own entry (`security-log-erased`) every time. `pnpm check:database` fails if any other such
  function is callable by the app, or if anyone else may call this one.

The tests (`tests/int/deletion.int.spec.ts`) run as the live site's database role, not the owner,
and search every text column in the database for the deleted person's name, email, phone and
address afterwards.

## The gatekeeper

Two settings make sure nothing reaches pjk.co.in without passing every check. Both are by hand,
once.

**GitHub → Settings → Rules → Rulesets → the `main` ruleset → Require status checks to pass.**
Tick these (each appears after its workflow has run once on a pull request):

- `verify` and `e2e` (CI)
- `Secret scan`, `Dependency, secret and config scan` and `Code scan (Semgrep)` (Security)

Also tick *Require branches to be up to date before merging*.

**Vercel → the project → Settings → Build and Deployment → Deployment Checks → Add Checks →
GitHub**, and choose the same five. Vercel then builds each production deployment but does not put
it live until those checks pass on its commit. It needs automatic production aliasing left on (the
default). In an emergency, **Promote** on a deployment overrides it.

## Before every release

Before merging anything to `main`:

1. CI and Security are green on the pull request (all five checks).
2. If it adds a migration: it only adds things (CI says so), and `pnpm payload migrate:create`
   with no changes makes no new file. If it changes data or is otherwise risky, take a Neon
   snapshot first ([RUNBOOK.md](RUNBOOK.md#4-restoring-the-database-neon)).
3. If it adds an environment variable: it is in `src/env.ts`, `.env.example` and the SETUP.md
   table (CI checks), and set in Vercel for Production and Preview **before** merging.
4. If it adds a route: it is in the route test's table, with who may call it.
5. If it touches sign-in, sessions, KYC or payouts: try it once on the Preview deployment.
6. Nothing in the diff logs a request body, an email address or anything a member typed.
7. A new dependency: needed, maintained, at least a week old, and not pulling in a tree of others.

After it goes live:

8. `https://pjk.co.in/api/health` says `ok` with the new commit; a new release appears in GitHub
   → Releases.
9. Vercel → Logs: no new errors in the first ten minutes.
10. If something is wrong: roll back first ([RUNBOOK.md](RUNBOOK.md)), then fix.

## Setting up the first account

Never hard-code a password. Run this against the right database:

```bash
ADMIN_EMAIL=aryaveer@pjk.co.in ADMIN_PASSWORD='choose-a-strong-one' pnpm create-admin
```

Locally that uses `.env`; for production, prefix it with the production `DATABASE_URL`. Run it again
at any time to reset a password or re-activate an account.

## Email is required in production

Sign-in codes are sent with Resend. **Without `RESEND_API_KEY` set, production sign-in refuses to
issue codes** rather than letting anyone in, so finish the email setup in
[SETUP.md](SETUP.md#6-email) before relying on the admin panel. In development, with no email service
configured, the code is printed in the terminal running `pnpm dev`.

## If you are locked out

- **Forgot the password:** use "Forgot password" on the admin sign-in screen (after the code), or
  re-run `pnpm create-admin` with a new password.
- **Email is down, so no code arrives:** with access to the server environment, run
  `ADMIN_EMAIL=you@pjk.co.in pnpm gate-token` and follow the printed instructions. It replaces only
  the code; the password is still required.
- **Someone has left:** suspend their account. If they must be deleted, a super admin uses **Delete
  this person**: their edit history stays, under *Deleted staff (ST-0007)*.
- **You suspect a break-in:** suspend the account, rotate `PAYLOAD_SECRET` in Vercel (this
  invalidates every gate cookie and session at once), then redeploy and check the security log.

## Worth doing when the site goes live

- Turn on two-factor authentication for the Vercel, Neon, GitHub and Resend accounts themselves —
  they are the real keys to the kingdom.
- Keep `PAYLOAD_SECRET`, `PREVIEW_SECRET` and `CRON_SECRET` different from each other, and never
  commit them.
- Treat any password typed into a chat window, ticket or email as exposed, and change it.
