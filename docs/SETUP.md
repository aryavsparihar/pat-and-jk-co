# Setup & deployment

How to take this project from your laptop to **https://pjk.co.in**. Allow an afternoon; most of it is creating accounts and waiting for DNS.

## 0. Before you start

Create these accounts using a **company-owned email address** (for example `tech@pjk.co.in` or a shared Google account for the company), not a personal one. The company should own its code, hosting, database and domain — so nothing is lost if people change roles.

| Service | What it's for | Cost to start |
| --- | --- | --- |
| **GitHub** — create an organisation (e.g. `pjk-co`) with a private repo | Code | Free |
| **Vercel** — sign in with GitHub | Hosting, deploys, SSL, media storage (Blob) | Free (Hobby); Pro recommended once it's a commercial site |
| **Neon** | PostgreSQL database | Free tier |
| **Resend** | Sending form notification emails | Free tier |
| **Zoho Mail** or **Google Workspace** | Company inboxes such as `hello@pjk.co.in` | Zoho has a free tier; Workspace is paid |

You also need the **login for the registrar where pjk.co.in was bought**, to edit its DNS records.

> Vercel's Hobby plan is intended for non-commercial use. For a company website, plan to move to Pro when the site launches publicly.

## 1. Push the code to GitHub

```bash
cd website
git remote add origin git@github.com:<your-org>/pjk-website.git
git push -u origin main
```

## 2. Create the database (Neon)

1. In Neon, create a project named `pjk` in the region closest to your users (e.g. **AWS Asia Pacific (Mumbai/Singapore)**).
2. Copy the **pooled** connection string (it contains `-pooler`). This is your production `DATABASE_URL`.
3. Optional: create a `dev` branch in Neon if you'd rather not run Postgres locally.

## 3. Create the Vercel project

1. Vercel → **Add New… → Project** → import the GitHub repo.
2. Framework: Next.js (auto-detected). Leave the build command as default — Vercel runs the `vercel-build` script automatically, which applies database migrations and then builds. Migrations run on production deploys only; see the Preview row in [Environments at a glance](#environments-at-a-glance).
3. **Storage → Create → Blob** and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically; uploaded images then live in Vercel Blob.
4. **Settings → Environment Variables** (Production and Preview):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `PAYLOAD_SECRET` | output of `openssl rand -hex 32` |
| `PREVIEW_SECRET` | another `openssl rand -hex 32` |
| `CRON_SECRET` | another `openssl rand -hex 32` |
| `MEMBER_SESSION_SECRET` | `openssl rand -base64 32`. Signs artist and partner sessions; rotating it signs every member out and nobody else |
| `NEXT_PUBLIC_SERVER_URL` | `https://pjk.co.in` |
| `DEFAULT_TENANT_SLUG` | `pjk` |
| `RESEND_API_KEY` | from step 6 (can be added later) |
| `EMAIL_FROM_ADDRESS` | `noreply@pjk.co.in` |
| `EMAIL_FROM_NAME` | `PAT and J.K. Co.` |
| `CONTACT_INBOX` | `hello@pjk.co.in` |
| `KYC_ENCRYPTION_KEY` | `openssl rand -base64 32`. Encrypts identity and bank details. Use a different key for Preview. Keep an offline copy: losing it loses every KYC record. See [KYC.md](KYC.md) |
| `KYC_BLIND_INDEX_KEY` | another `openssl rand -base64 32`, never the same as the encryption key. Finds duplicate PANs and accounts without decrypting |
| `KYC_STORE_ID` | set by Vercel when you create a second, **private** Blob store (Storage → Create → Blob, access Private, named `pjk-kyc`) and connect it to Production and Preview with the prefix `KYC`. It is reached with the deployment's OIDC token, so there is no token to copy. Vercel also adds `KYC_WEBHOOK_PUBLIC_KEY`, which the site does not use |

The app checks these when it starts (`src/env.ts`). If one is missing or malformed, the build stops with a list naming each problem, and the live site carries on running the previous deployment. Which are required where is in [Environment variables](#environment-variables) below.

5. Deploy. The first deploy creates all database tables.

## Environment variables

Every variable the code reads. **Secret** ones must never be committed, pasted into a chat or
ticket, or put in a `NEXT_PUBLIC_` variable (those are sent to every browser). `.env.example`
lists each with a placeholder, the boot check (`src/env.ts`) validates each, and `pnpm check:env`
fails CI if the code reads a variable that is in neither.

Key: **R** required, **O** optional, **—** not used, *auto* set by Vercel.

| Variable | What it is for | Secret | Production | Preview | Local |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | The database, as the least-privileged app role (see [Database roles](#database-roles)) | yes | R | R | R |
| `DATABASE_URL_MIGRATE` | The database owner, for migrations at build time only. Setting it turns on the boot check that refuses to run the site as the owner | yes | R once the roles are split | R once the roles are split | — |
| `MIGRATE_ON_PREVIEW` | `1` runs migrations on preview deploys (Preview has its own Neon branch) | no | — | R | — |
| `PAYLOAD_SECRET` | Signs staff sessions, the admin gate and keys the rate-limit hashes | yes | R | R | R |
| `MEMBER_SESSION_SECRET` | Signs artist and partner sessions | yes | R | R | O (derived locally) |
| `PREVIEW_SECRET` | Live preview of drafts in the admin | yes | R | R | O |
| `CRON_SECRET` | Vercel Cron's key for the weekly KYC purge and the job queue | yes | R | R | O |
| `NEXT_PUBLIC_SERVER_URL` | The site's own address, for links, CORS and CSRF | no | R (`https://pjk.co.in`) | R | O |
| `DEFAULT_TENANT_SLUG` | The brand served on unknown hostnames | no | O (`pjk`) | O | O |
| `ALLOWED_ORIGINS` | Extra brand domains trusted with cookies | no | O | O | — |
| `ADMIN_EMAIL_DOMAIN` | The only domain staff accounts may use (default `pjk.co.in`) | no | — | — | — |
| `RESEND_API_KEY` | Sending email | yes | R | R | O (printed instead) |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Who emails come from | no | O | O | O |
| `CONTACT_INBOX`, `BUSINESS_INBOX`, `TECHNICAL_INBOX` | Where enquiries go; shown on the site | no | O | O | O |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile, in the browser | no | R (real key) | R (test key) | — |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile, on the server | yes | R (real key) | R (test key) | — |
| `BLOB_READ_WRITE_TOKEN` | The public media store | yes | auto, R | auto | — |
| `BLOB_STORE_ID` | The public media store's ID, read only to keep KYC out of it | no | auto | auto | — |
| `KYC_ENCRYPTION_KEY` | Encrypts identity and bank details | yes | R | R (its own) | O (derived locally) |
| `KYC_BLIND_INDEX_KEY` | Finds duplicate PANs and accounts | yes | R | R (its own) | O |
| `KYC_ENCRYPTION_KEY_PREVIOUS` | Only while rotating the KYC key | yes | O | O | — |
| `KYC_STORE_ID` | The private store for identity documents | no | auto, R | auto | — |
| `LOG_LEVEL`, `DISABLE_LOGGING` | How much is logged | no | O | O | O |
| `DEV_APPLICATIONS_OPEN` | Opens applications on a developer's machine only; ignored in production builds | no | — | — | O |
| `VERCEL_*`, `NODE_ENV`, `NEXT_*`, `CI` | Set by the platform | no | auto | auto | — |

Vercel also sets `BLOB_WEBHOOK_PUBLIC_KEY` and `KYC_WEBHOOK_PUBLIC_KEY`, as part of each Blob store
connection. Nothing reads them, and they cannot be deleted without disconnecting the stores, so
leave them: they are public keys, and neither the boot check nor CI looks at them.

Only command-line scripts and tests read `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`
(`pnpm create-admin`), `SEED_RESET`, `APP_DATABASE_URL` (`pnpm check:database`), `E2E_BASE_URL` and
`PLAYWRIGHT_CHROMIUM_PATH`. Never set them in Vercel.

## Database roles

The site connects as **`pjk_app`**, which may read and write rows and nothing else: no creating,
changing or dropping tables, not the owner, and it cannot bypass Row-Level Security. Only
migrations, at build time, use the owner (`neondb_owner`). The migration
`20261013_185333_app_role_and_rls` creates a group role, `pjk_app_access`, holding exactly those
rights, and turns Row-Level Security on for every table with a policy for that group alone. You
create the login role and put it in the group. Do these steps in this order, so the live site
never breaks along the way.

1. **Merge and deploy** the pull request that adds the migration. Production migrates as before
   (with today's `DATABASE_URL`, the owner), creating `pjk_app_access`. The site logs a warning that
   it is connected as the owner; that is expected until step 4.
2. **Make a password** on your own computer, and keep it only in your password manager:
   `openssl rand -base64 32`
3. **Create the role in Neon**, on the `main` branch: Neon → your project → **SQL Editor**, branch
   `main`, database `neondb`, then run (with your password between the quotes):

   ```sql
   CREATE ROLE pjk_app WITH LOGIN PASSWORD 'the-password-from-step-2';
   GRANT pjk_app_access TO pjk_app;
   ```

   Use the SQL Editor rather than **Roles → New role**: roles made in the console are also given
   `neon_superuser`, which the site must not have. Then run the same two lines on the `preview`
   branch, with a different password (Preview's migrations, with `MIGRATE_ON_PREVIEW=1`, create
   `pjk_app_access` there).
4. **Set the variables in Vercel** (Settings → Environment Variables), for Production, then for
   Preview with that branch's values:
   - `DATABASE_URL_MIGRATE`: the current owner connection string. Neon → **Connect**, role
     `neondb_owner`, **Connection pooling off** (migrations are better without the pooler).
   - `DATABASE_URL`: the same pooled string as now, with `neondb_owner:…@` replaced by
     `pjk_app:<the password>@`. Keep `-pooler` in the host.
   - In both, where the string says `sslmode=require`, write `sslmode=verify-full`: it checks the
     database's certificate as well as encrypting. Today's driver already treats `require` that
     way and prints a notice in the build log saying so; a later version will not.
5. **Redeploy** (Deployments → the latest → Redeploy). The build migrates as the owner and the site
   runs as `pjk_app`. From now on, a deployment connected as the owner refuses to start, so a
   mistake here shows up at once. If anything goes wrong, put the old `DATABASE_URL` back, delete
   `DATABASE_URL_MIGRATE`, and redeploy: everything is as it was.
6. **Check**: `/api/health` says `ok`, and the warning about the owner has gone from the logs
   (Vercel → Logs, search "connected to the database as").

`pnpm check:database` checks all of this against any database (CI runs it on every pull request):
RLS on every table, no policy for any other role, and `pjk_app_access` holding no more than
listed. A migration that adds a table must also enable RLS on it and add the policy, as
`app_role_and_rls` does, or CI fails.

## 4. Load the starter content

From your laptop, point the seed script at the production database once:

```bash
DATABASE_URL="<neon pooled connection string>" pnpm seed
```

Then create your own admin account (the password is read from the environment and never stored in the repository):

```bash
DATABASE_URL="<neon pooled connection string>" ADMIN_EMAIL=aryaveer@pjk.co.in ADMIN_PASSWORD='choose-a-strong-one' pnpm create-admin
```

> **Admin sign-in needs working email.** Signing in requires a one-time code sent to your `@pjk.co.in` mailbox, so finish step 6 before relying on the admin panel in production. Colleagues ask for access at `/admin-access`; you approve them under **Administration → Access requests**. See [SECURITY.md](SECURITY.md).

## 5. Connect pjk.co.in

1. Vercel → Project → **Settings → Domains** → add `pjk.co.in` and `www.pjk.co.in`. Choose to **redirect www → pjk.co.in**.
2. Vercel shows the exact DNS records to create (typically an `A` record for `pjk.co.in` and a `CNAME` for `www`). Add them at your registrar exactly as shown.
3. Wait for DNS to propagate (minutes to a few hours). Vercel issues the SSL certificate automatically.
4. Check `https://pjk.co.in` loads the PJK site and `https://pjk.co.in/admin` loads the admin.

The seeded brand already lists `pjk.co.in` and `www.pjk.co.in` under **Administration → Brands**, so no content changes are needed.

## 6. Email

**Inbox (to receive enquiries).** Set up `hello@pjk.co.in` with Zoho Mail or Google Workspace. They will ask you to add **MX** and **TXT (SPF)** records at the registrar.

**Sending (sign-in codes and form notifications).** Step-by-step instructions for this domain, including where each record goes in GoDaddy, are in [EMAIL.md](EMAIL.md). In short: add the domain in Resend, add its three DNS records, create an API key, and set `RESEND_API_KEY`. Check it with `pnpm check-email aryaveer@pjk.co.in`.

Which inbox receives each form is set per form under **Enquiries → Forms → Emails**.

## 7. Scheduled publishing

Editors can schedule pages and posts to publish later. `vercel.json` runs Payload's job queue once a day (the most frequent schedule Vercel's Hobby plan allows). On Vercel Pro, change the schedule to hourly (`0 * * * *`) for finer timing. It also runs the KYC purge once a week ([KYC.md](KYC.md#retention)). Both are authorised by `CRON_SECRET`, which must be set in Production.

## 8. After launch

- **Google Search Console** — add `pjk.co.in`, verify with a DNS `TXT` record, and submit `https://pjk.co.in/sitemap.xml`.
- **Analytics** — enable Vercel Web Analytics (cookie-free, no consent banner needed).
- **Performance** — run <https://pagespeed.web.dev> against the live site.
- **Backups** — Neon keeps point-in-time history (length depends on plan). For extra safety, run a periodic `pg_dump` of the database.
- **Privacy policy** — the seeded `/privacy` page is a starting draft; have it reviewed before launch.

## Environments at a glance

| | Local | Preview (every git branch) | Production |
| --- | --- | --- | --- |
| URL | localhost:3000 | `*.vercel.app` (not indexed by search engines) | pjk.co.in |
| Database | local Postgres | a Neon branch of its own (set `DATABASE_URL` and `MIGRATE_ON_PREVIEW=1` for Preview only). If Preview shares production's database, migrations are skipped there | Neon `main` |
| Media | `public/media/` | Vercel Blob | Vercel Blob |
| Email | printed to terminal | Resend | Resend |
| Schema changes | pushed automatically | migrations, only with `MIGRATE_ON_PREVIEW=1` | migrations |

## What to collect from the client

- Original **vector logo** (AI/EPS/SVG/PDF). The current logo was traced from a PNG and is good, but the original is best.
- **Founder photograph** and approval of the bio on `/leadership`.
- **Phulhaar Gallery photographs** (artworks, framing detail, space) — landscape for the venture cover.
- Registered **address**, **phone**, and **social media** handles (Site settings → Contact & social).
- Sign-off on all seeded copy — every word is editable in the admin.
