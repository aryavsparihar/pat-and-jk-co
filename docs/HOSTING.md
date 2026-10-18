# Where the site could run, and how we would move

A plan, not a move. Nothing here happens without the founder's OK, and only if Vercel's free plan
stops being enough once its usage is fixed (below). Prices are as published in October 2026;
Hetzner and Render change theirs often, so check the linked pages before buying anything.

The app as it is: Next.js 16 with Payload 3 in one Node process; `sharp` for every picture the
site keeps (a native library); two cron jobs (the daily job queue, the weekly KYC purge); Postgres
on Neon (Singapore); files in Vercel Blob (public media, and a private store for KYC documents and
artists' pictures, reached with Vercel's OIDC token); email through Resend. Visitors and artists
are almost all in India.

## First: is Vercel actually running out?

The usage that looked like the plan running out was mostly our own doing, fixed in October:

| | What it was | Why | Now |
| --- | --- | --- | --- |
| Function invocations | 32K of 43K requests | every page view made 4 server calls (who is signed in ×2, Payload's admin bar ×2) and prefetched the sign-in page | 2 on a visitor's first page, then none but the visit count, which the CDN answers |
| Active CPU | 1 h 35 min of 4 h by mid-month | the same calls, each starting Payload | expected well under 1 h a month |
| ISR writes | 20K (more than reads) | every page regenerated hourly | every six hours |
| Function storage | 7.7 GB (75 %) | about 53 MB of functions in each of 172 deployments kept, including Dependabot previews | previews kept a week, no deployments for Dependabot or docs, one function fewer per deployment (docs/COSTS.md) |

Look again at Vercel → Usage two weeks after those changes. If function storage and CPU sit well
inside the free limits, there is nothing to move.

## The options

| | Monthly cost | Moving there | Risk | Speed from India | What we would run ourselves |
| --- | --- | --- | --- | --- | --- |
| **Vercel Hobby** (today) | $0 | — | Hard limits: functions pause, Blob switches off, when exceeded | Good: functions in Singapore beside Neon, CDN in Mumbai | Nothing |
| [**Vercel Pro**](https://vercel.com/pricing) | $20 + usage beyond $20 credit | A plan change | Low | Same | Nothing |
| [**Railway**](https://railway.com/pricing) | $5 Hobby / $20 Pro, plus usage: about $20 per vCPU and $10 per GB of memory a month; this app (1 vCPU, 1–2 GB, always on) is about $30–40 | 2–3 days: a Dockerfile, env, crons as a second service, Blob → R2 | Medium: a smaller company; check it offers an Asian region before choosing | Depends on the region; Europe or US adds 150–250 ms to every request | The Dockerfile; little else |
| [**Render**](https://render.com/pricing) | Web service Standard (2 GB) about $25, plus a cron job per schedule (a few dollars); Singapore region | 2–3 days, as Railway | Medium-low | Good in Singapore | The Dockerfile; little else |
| **Hetzner VPS, Singapore, with Coolify** | A 2 vCPU / 4 GB or 4 vCPU / 8 GB server, roughly €15–35 in Singapore after Hetzner's 2026 increases (check the [calculator](https://www.hetzner.com/cloud)); Singapore includes far less traffic than Europe | 4–6 days, then about 2 hours a month | Medium-high: a single server, and everything below is ours | Good: Singapore, with Cloudflare in front for the CDN | Everything: see "What we would run ourselves" |
| **Cloudflare Workers via OpenNext** | $5 Workers Paid, plus R2 | Weeks | High | Excellent (Cloudflare's network) | Little, once it runs. But `sharp` does not run on Workers: every picture check, re-encode and resize (src/members/portfolio.ts, KYC identity photos, Payload's sizes) would need rewriting for WebAssembly or Cloudflare Images (paid). The app is near the Worker size limit (10 MB compressed on Paid). Payload's Cloudflare template expects D1, not Postgres. The parts that protect artists' data are exactly the parts that would change |

**What we would run ourselves on a VPS:** operating-system and package security updates; Node and
Next.js updates; TLS certificates and their renewal; the firewall; SSH access; fail2ban; container
images and their scanning; backups of the server itself (the database is already backed up
nightly); disk space; log rotation and shipping; uptime monitoring and alerts; deploys without
downtime; and being the one who is paged when the single server dies.

## Recommendation

**Stay on Vercel's free plan through the 8 November launch.** The usage fixes above take away the
reason to move, and moving two weeks before launch, with identity documents and payouts in the
system, is more risk than the money saved. The cutover would have to be finished by 1 November,
which leaves no time to run it alongside Vercel for a week.

**If a move is needed after launch,** the founder's leaning is sound: a Hetzner VPS in Singapore
with Coolify, Neon kept as it is, files on Cloudflare R2, and Cloudflare in front. It is the
cheapest option that is fast from India, and Coolify takes much of the server work off our hands.
Render in Singapore is the alternative if no one wants to look after a server: about the same
money, far less to run. The full plan for the VPS follows, so it can start the day it is wanted.

## The plan, if we move to Hetzner with Coolify

**What to buy and set up (the founder):**

1. A Hetzner Cloud account; a server in **Singapore**, x86, 4 vCPU / 8 GB (CPX32 or the current
   equivalent), Ubuntu 24.04, with an SSH key and backups switched on (+20 % of the server price).
2. A Cloudflare account (free) for DNS in front of the server and its CDN, and R2 for files (the
   storage switch in this repository; docs/COSTS.md, "Moving media to Cloudflare R2").
3. An uptime monitor: [Better Stack](https://betterstack.com/uptime) or UptimeRobot, free tiers.
4. Nothing else: Neon, Resend, Turnstile, GitHub and the backups stay as they are.

**Time:** about a week of work, then a week running alongside Vercel. Earliest finish if started on
the 9th of November: around the 23rd.

### 1. The Docker image

- `output: 'standalone'` in next.config.ts, and a multi-stage Dockerfile: `node:24-bookworm-slim`
  to install with pnpm and build (with `sharp`'s prebuilt Linux binaries), then a slim runtime
  stage that copies only `.next/standalone`, `.next/static` and `public`.
- The container runs as a non-root user (`USER node`), with a read-only root filesystem and `/tmp`
  as its only writable place; no shell tools beyond what Node needs.
- Migrations run in a one-off container before each release (`pnpm payload migrate`, as the owner
  role), never in the app container, which connects as `pjk_app`, as now.
- CI builds the image on every pull request (cache: GitHub's Docker layer cache) and scans it with
  **Trivy** (`aquasecurity/trivy-action`, fail on HIGH and CRITICAL with a fix available), as the
  dependency scan does today. Images are pushed to GitHub Container Registry, tagged by commit.

### 2. The server (hardening, before anything is installed)

- SSH **keys only**: `PasswordAuthentication no`, `PermitRootLogin no`, a named sudo user; SSH on
  port 22 only from the founder's IP (and a second, documented way in: Hetzner's console).
- Firewall: Hetzner's cloud firewall **and** `ufw`, allowing 80 and 443 only from Cloudflare's
  published ranges (so nobody can reach the server without passing Cloudflare), and 22 only from
  the founder's IP. Everything else denied, in and out except what the app needs (443 out).
- `fail2ban` on SSH; `unattended-upgrades` for security updates, with automatic reboots at 03:30
  India time when a kernel needs one.
- Docker from Docker's own repository; containers run as non-root; no container gets the Docker
  socket except Coolify's own.

### 3. Coolify

- Coolify (free, self-hosted) installed on the same server, its dashboard reachable only through
  an SSH tunnel or Cloudflare Access, never open to the internet.
- The app as a Docker image from GHCR; environment variables as in Vercel today (with
  `DATABASE_URL` for `pjk_app`, `DATABASE_URL_MIGRATE` only for the migration job). Two replicas
  behind Coolify's proxy, so a deploy swaps one at a time without downtime.

### 4. TLS

- Cloudflare in front, **Full (strict)** mode; a Cloudflare Origin Certificate on the server (15
  years, so nothing to renew), and the server refusing any request that did not come through
  Cloudflare (the firewall above, plus Authenticated Origin Pulls).
- HSTS stays as the site sends it now.

### 5. The cron jobs

- The two jobs become Coolify scheduled tasks calling the same routes with `CRON_SECRET`:
  `/api/payload-jobs/run` daily at 00:30 UTC and `/next/cron/kyc-purge` Mondays at 02:00 UTC.
  Each run already writes to the security log, which is how we see they ran.

### 6. Logs and uptime

- Container logs to [Better Stack Logs](https://betterstack.com/logs) (free tier: a few GB a month)
  or Grafana Cloud's free tier, through Vector; the app's logs are already redacted.
- Uptime: `/api/health` every minute from two regions; `/api/health?deep=1` every 15 minutes with a
  staff token kept in the monitor; alerts to tech@pjk.co.in.
- The site's own server-error alerts keep working unchanged.

### 7. Backups

- The database: the nightly encrypted backup to Google Drive, unchanged (RUNBOOK.md).
- The server: Hetzner's daily backups (7 kept) and a weekly snapshot before updates. Nothing on the
  server is irreplaceable, but it saves rebuilding Coolify's settings.
- Files: R2 (with object versioning on for `pjk-private`), copied weekly to a second bucket.

### 8. Files from Vercel Blob to R2

As in docs/COSTS.md, "Moving media to Cloudflare R2", done first, while still on Vercel, and
proved there with the storage self-check before anything else moves. The private store then needs
an R2 key in place of Vercel's OIDC token.

### 9. A staging address for a full test

- `staging.pjk.co.in` on the same server, its own Coolify app, pointing at **Neon's preview branch**
  and a separate R2 bucket pair, behind Cloudflare Access (only staff can open it).
- A full run there: the browser tests (`E2E_BASE_URL=https://staging.pjk.co.in pnpm test:e2e`),
  sign-in by code, an application with KYC, a staff approval, a deletion, the crons by hand, a
  restore of last night's backup into a Neon branch, and a load test of the session check.

### 10. Cutover, with Vercel kept for a week

1. A week before: lower the DNS TTL for pjk.co.in to 5 minutes.
2. On the day: switch applications off (Site settings); deploy the same commit to Vercel and to
   the server; run migrations once; check `/api/health?deep=1` on both.
3. Point pjk.co.in at the server (through Cloudflare). Watch the logs, uptime and the security log
   for an hour; switch applications back on.
4. Keep the Vercel deployment live and its domain alias ready for a week; both use the same Neon
   database and R2, so either can serve at any moment.
5. After a quiet week, remove the domain from Vercel and pause its cron jobs.

### 11. Rollback

At any point in that week: point pjk.co.in back at Vercel in Cloudflare (minutes, with the short
TTL). Nothing else changes, since both run the same code against the same database and files.
After the week, rollback is a normal Vercel redeploy plus the DNS change.

### Timing

Either finished, tested and cut over **by 1 November**, or started **after 8 November**. Given
the steps above, only the second is realistic; the plan assumes it.
