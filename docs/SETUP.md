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
| `NEXT_PUBLIC_SERVER_URL` | `https://pjk.co.in` |
| `DEFAULT_TENANT_SLUG` | `pjk` |
| `RESEND_API_KEY` | from step 6 (can be added later) |
| `EMAIL_FROM_ADDRESS` | `noreply@pjk.co.in` |
| `EMAIL_FROM_NAME` | `PAT and J.K. Co.` |
| `CONTACT_INBOX` | `hello@pjk.co.in` |

The app checks these when it starts (`src/env.ts`). If one is missing or malformed, the build stops with a list naming each problem, and the live site carries on running the previous deployment. In production `NEXT_PUBLIC_SERVER_URL`, `RESEND_API_KEY` and `BLOB_READ_WRITE_TOKEN` are required as well.

5. Deploy. The first deploy creates all database tables.

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

Editors can schedule pages and posts to publish later. `vercel.json` runs Payload's job queue once a day (the most frequent schedule Vercel's Hobby plan allows). On Vercel Pro, change the schedule to hourly (`0 * * * *`) for finer timing.

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
