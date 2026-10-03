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
| Passwords | At least 12 characters with upper, lower, number and symbol; may not contain the address or a common phrase |
| Wrong passwords | Account locks for 15 minutes after 5 attempts (Payload) |
| Sessions | Gate lasts 12 hours; the admin session lasts 8 hours |
| Cookies | httpOnly, SameSite=Strict, Secure in production |
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
| Public forms | Honeypot, 5 submissions per IP per 10 minutes (counted in Postgres, so the limit holds across every serverless instance; see `src/security/rateLimit.ts`), fields checked against the form definition (unknown fields dropped, required fields enforced, dropdowns limited to their own options), values capped at 5 000 characters, brand assigned from the form rather than from the request |
| Enquiries | Readable only by signed-in users of the owning brand; never by the public |
| Drafts | Filtered out for anyone not signed in, including through `?draft=true` on the API |
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

## Members

Artists and partners sign in with a one-time code and nothing else (the page, `/collaborate/signin`, comes with the onboarding).
The endpoints live under `/next/members/`.

| | |
| --- | --- |
| Codes | The same implementation as the staff gate (`src/security/challenges.ts`): 6 digits, 10 minutes, single use, 5 attempts, keyed hash salted per challenge, constant-time compare. Attempts are reserved atomically before comparing, so parallel guesses cannot exceed five |
| Code requests | 5 per address and 20 per IP per hour, counted in Postgres |
| Verification | 30 per IP per hour; an address with 10 wrong codes in an hour is **locked** for the rest of the hour, even against the right code, and the lockout is logged |
| Enumeration | A sign-in request gets the same reply whether or not the address is registered; an application request always sends a code, so it reveals nothing either |
| Sessions | `pjk_member` cookie: httpOnly, SameSite=Lax, Secure in production, signed with `MEMBER_SESSION_SECRET`. A week from last use, never more than 30 days. A new session on every sign-in (the old one is ended). The database holds only a keyed hash of the session secret, and no IP address |
| Sign out everywhere | Ends every session of the member at once. Suspending a member does the same |
| Origin | Every state-changing member endpoint refuses requests whose `Origin` is not the site's own |
| Admin | Members can never reach `/admin`: their collection refuses admin access, the member guard refuses it again, and the staff gate stands in front of it |
| Audit | Code requests, sends, failures, lockouts, sign-ins, sign-outs, creations, decisions and issued member IDs all go to the security log; decisions record the staff member who took them |

**If member accounts are compromised:** rotate `MEMBER_SESSION_SECRET` in Vercel and redeploy.
Every member session ends at once; staff are unaffected.

The staff gate now shares this code-checking implementation. Its rules and messages are unchanged,
but two flaws went with the move: parallel guesses could each be compared before the attempt limit
applied, and the failure response was a single shared object, which can only be read once.

## Identity and bank details (KYC)

Encrypted field by field under a key kept only in the environment, shown masked, revealed only to
KYC reviewers with a logged reason, and deleted on a schedule. The whole design, its retention
rules and its threat model are in [KYC.md](KYC.md).

### Aadhaar

Every artist gives a **PAN**: we need it to pay them and for tax, and it is the identity we check.
Aadhaar is **optional**, and only as a way to show an address: a **masked Aadhaar**, the copy UIDAI
issues with the first eight digits hidden, with its last four digits. We never accept, store or
display a full Aadhaar number. Why:

- The Aadhaar Act limits how Aadhaar numbers may be collected and used, and UIDAI requires anyone
  who stores them to keep them in a separate, specially secured Aadhaar Data Vault. We are not set
  up for that, and have no need to be: we do not authenticate anyone with Aadhaar. (Our lawyer or
  CA should confirm this reading along with the privacy notice.)
- Four digits and a masked copy are enough for a person to check that the document matches the
  person and the address, which is all we use it for.
- A number we never hold cannot leak. The server refuses twelve digits with a message that does
  not repeat them, and the log redaction would remove them in any case.

**Offline e-KYC (not built).** UIDAI's signed offline e-KYC (the XML in a ZIP opened with a share
code, or the Secure QR) would let us confirm a name, date of birth and address without ever seeing
the Aadhaar number. It is not used yet: since the 2025 amendments to the Aadhaar (Authentication
and Offline Verification) Regulations, at least the XML route needs registration with UIDAI as an
Offline Verification Seeking Entity, and that is a decision for the business and its lawyer first.

## Logs

Every log line goes through one logger (`src/observability/logger.ts`): Payload's, the plugins'
and ours. In production it writes JSON, one object per line; locally it stays readable. Before
anything is written, `src/observability/redact.ts` removes email addresses, phone numbers, PAN,
IFSC, and any run of 9 to 18 digits (Aadhaar and bank account numbers), wherever they appear: in
the message, in fields, inside error messages and stacks. Values under keys such as `password`,
`otp`, `token`, `pan` or `accountNumber` are dropped whatever they contain. A test logs a PAN every
way it can and checks it never comes out.

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

Outside the app, one Vercel Firewall rule (the most Hobby allows) can add a coarse per-IP ceiling;
see [AUDIT.md](AUDIT.md#9-rate-limiting).

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
- **Someone has left:** suspend their account (do not delete it, so their edit history stays intact).
- **You suspect a break-in:** suspend the account, rotate `PAYLOAD_SECRET` in Vercel (this
  invalidates every gate cookie and session at once), then redeploy and check the security log.

## Worth doing when the site goes live

- Turn on two-factor authentication for the Vercel, Neon, GitHub and Resend accounts themselves —
  they are the real keys to the kingdom.
- Keep `PAYLOAD_SECRET`, `PREVIEW_SECRET` and `CRON_SECRET` different from each other, and never
  commit them.
- Treat any password typed into a chat window, ticket or email as exposed, and change it.
