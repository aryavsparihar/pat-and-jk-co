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
| Response headers | CSP, HSTS, `nosniff`, `SAMEORIGIN`, a restrictive `Permissions-Policy` — all in `next.config.ts` |
| Uploaded files | Served with `sandbox` and `default-src 'none'`, so an uploaded SVG cannot run script against the site |
| Public forms | Honeypot, 5 submissions per IP per 10 minutes, fields checked against the form definition (unknown fields dropped, required fields enforced, dropdowns limited to their own options), values capped at 5 000 characters, brand assigned from the form rather than from the request |
| Enquiries | Readable only by signed-in users of the owning brand; never by the public |
| Drafts | Filtered out for anyone not signed in, including through `?draft=true` on the API |
| Dependencies | `pnpm audit --prod` is clean; `pnpm-workspace.yaml` pins patched versions of transitive packages |

The `script-src` directive still allows `'unsafe-inline'` and `'unsafe-eval'` because Next.js and
the Payload admin both need them; tightening that means moving every inline script onto a nonce.
`https://cdn.jsdelivr.net` is allowed for the admin's code editor only — if the admin never shows
a code field, remove it.

If something in the admin panel ever fails to load, the CSP in `next.config.ts` is the first thing
to check: the browser console names the directive that blocked it.

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
