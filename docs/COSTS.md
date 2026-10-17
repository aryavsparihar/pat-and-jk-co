# What the site costs, and how to keep it low

Prices are as published in October 2026 (links below). Check them again before any change: they
move. Amounts are in US dollars, as the services bill; most add GST for an Indian account.

PJK is the onboarding and management site: artists apply, staff approve artists and works, and
approved works go to the **Phulhaar Gallery on Shopify**, which sells them and serves the
pictures buyers see. So PJK's storage holds only what is waiting for review, KYC documents, and
the record copies of approved works; its traffic is artists and staff, not shoppers. Shopify's own
plan is Phulhaar's cost and is not counted here.

## What we pay today

| Service | Plan | Cost a month | Notes |
| --- | --- | --- | --- |
| Hosting | [Vercel Hobby](https://vercel.com/pricing) | $0 | **Personal, non-commercial use only** (below) |
| Files | [Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing), on Hobby | $0 | 1 GB stored, 10 GB transfer, 2,000 uploads a month |
| Database | [Neon Free](https://neon.com/pricing) | $0 | 100 compute-hours a month, 6 hours of history |
| Email | [Resend Free](https://resend.com/pricing) | $0 | 3,000 a month, **100 a day** |
| CI | [GitHub Pro](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | $4 | 3,000 Actions minutes; $0.006 a minute beyond, capped by your $10 limit |
| Maps | [Google Maps Platform, India pricing](https://mapsplatform.google.com/intl/en_in/pricing/) | $0 | 70,000 free calls a month per Essentials SKU |
| Bot checks | Cloudflare Turnstile | $0 | |
| Backups | Google Drive (your account's 15 GB) | $0 | About 100 MB for 14 daily and 8 weekly copies |
| **Total** | | **about $4** | Plus the domain and mailboxes at GoDaddy |

## Three things that will break before they cost money

1. **Vercel Hobby is not allowed for this site.** Vercel's
   [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)
   define commercial usage as any deployment used "for the purpose of financial gain of anyone
   involved in any part of the production of the project", and list "advertising the sale of a
   product or service" among the examples. PJK is a sole proprietorship that recruits artists
   whose works it sells, on commission, through Phulhaar. That is commercial even though PJK
   itself takes no payments, so it needs Vercel Pro (or another host). If you want certainty,
   Vercel Support will confirm, but I would not count on a different answer.
2. **Blob storage on Hobby stops, not bills.** Past 1 GB, Vercel does not charge: it switches Blob
   off for 30 days. Every KYC document and every artist's private picture would be unreadable.
   At launch PJK will hold about 2 GB (below), so this would happen within weeks.
3. **Resend's free plan sends at most 100 emails a day.** A sign-in code is an email. On a busy
   day after applications open (codes, confirmations, staff notifications), the 101st person does
   not get their code, and nothing tells them why. The error alerts added in October cap
   themselves at ten a day so they never compete for this.

## What we will hold and send

Assumptions: a few hundred artists, a few thousand works with pictures, videos on YouTube, Vimeo or
the artist's Drive (never on our storage), modest traffic. Pictures are kept at 2,400 px (about
1 MB); KYC documents are about 1 MB each, three per artist.

| | Launch (Nov 2026) | 6 months | 12 months |
| --- | --- | --- | --- |
| Applicants / approved artists | 100 / 50 | 400 / 250 | 700 / 400 |
| Works approved (record copies, ~4 pictures each) | 300 | 2,000 | 4,000 |
| Application pictures | 0.8 GB | 3 GB | 6 GB |
| KYC documents (encrypted) | 0.3 GB | 1.2 GB | 2 GB |
| Work pictures kept for the record | 1.2 GB | 8 GB | 16 GB |
| **Storage** | **~2.3 GB** | **~12 GB** | **~24 GB** |
| Database | < 0.1 GB | ~0.2 GB | ~0.5 GB |
| Emails a month (peak day) | ~1,500 (~150) | ~2,000 (~80) | ~2,500 (~80) |
| Actions minutes a month | ~800 + 45 backups | ~600 + 45 | ~600 + 45 |

Two easy savings, not yet made: keep record copies at 1,600 px (about 40% of the size), and delete
a declined applicant's pictures with their KYC after 90 days. Ask before either: the first changes
what staff keep, the second what the record holds.

## What it will cost

| | Launch | 6 months | 12 months |
| --- | --- | --- | --- |
| Vercel Pro (1 seat, $20 of usage included) | $20 | $20 | $20 |
| Blob on Pro ($0.023/GB-month; uploads $5 per million) | inside the $20 | inside | inside |
| Neon Free, with the nightly backups | $0 | $0 | $0, or Launch ~$5–8 |
| Email | $0 if under 100 a day; else ZeptoMail ~$1 | ~$1 | ~$1 |
| GitHub Pro | $4 | $4 | $4 |
| Google Maps (with quotas set) | $0 | $0 | $0 |
| **Total** | **~$24–25** | **~$25** | **~$25–33** |

## Cheaper options, honestly

### Storage for pictures and KYC documents

| | Stored | Transfer out | At 24 GB | Moving there | Risk, and what we run |
| --- | --- | --- | --- | --- | --- |
| [Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing) (Pro) | $0.023/GB | in Pro's CDN allowance | ~$0.55 | none | None new. The private store needs no long-lived key (OIDC) |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | 10 GB free, then $0.015/GB | free | ~$0.21 | settings and a copy script (below) | An access key to keep secret; R2 needs a card on file |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | 10 GB free, then ~$0.007/GB | free up to 3× stored | ~$0.10 | the same | The same, and less tooling around it |

At these sizes the difference is cents. R2 matters only if we leave Vercel, or if storage grows
past ~50 GB. The code is ready either way (`src/storage/objectStore.ts`).

**Why not Google Drive** for site pictures or KYC documents:

- *Site pictures.* Drive is not a CDN. Shared links are rate-limited and throttled when popular,
  can be blocked by its virus-scan page, carry no caching we control, and break if anyone changes
  the sharing. Google's terms are not for hosting a website's assets. Shopify's import may fail
  to fetch them.
- *KYC documents.* They would sit in a personal Google account, outside our encryption, our access
  rules and our security log. One wrong sharing setting exposes passports and PAN cards. Our
  retention purge cannot reach them, which breaks what we promise under the DPDP Act. Staff could
  forward them. KYC stays encrypted in the private store.
- The **backups** go to Drive only because they are encrypted before they leave GitHub: Drive
  holds ciphertext, and the key is offline with you.
- Drive is right for what it does now: artists' originals and videos, shared with us by link.

### Hosting

| | Cost | Moving there | What changes for us |
| --- | --- | --- | --- |
| [Vercel Pro](https://vercel.com/pricing) | $20/month | a plan change, no code | Nothing. Logs kept a day instead of an hour; spend alerts available |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/) via OpenNext | $5/month (Workers Paid) | weeks, with real risk | `sharp` (picture cleaning, Payload's resizing) does not run on Workers; the app is near the Worker size limit; Blob's OIDC must become R2 bindings; Postgres through Hyperdrive. Large rewrite of exactly the parts that protect artists' data |
| Small VPS ([Hetzner](https://www.hetzner.com/cloud), 2 vCPU/4 GB) with Coolify or Docker | about €4–8/month (Singapore costs more) | days to set up, then ongoing | Everything below becomes ours |

On a VPS we would have to run, and answer for, all of this: operating-system and package patching,
Node and Next.js upgrades, TLS certificates and their renewal, a firewall (only 80 and 443 open,
SSH by key only, fail2ban), DDoS protection (Cloudflare in front), backups of the server itself,
uptime and error monitoring, log rotation and retention, deploys without downtime, disk filling
up, and being woken when the one machine dies. For a one-person team holding identity documents,
that is the expensive option, whatever the invoice says.

### Database

| | Cost | History you can restore | Notes |
| --- | --- | --- | --- |
| [Neon Free](https://neon.com/pricing) | $0 | 6 hours | 100 compute-hours/month: the site suspends after 5 idle minutes, so modest traffic fits. Past the limit the database **stops** until next month |
| Neon Launch | $0.106/CU-hour + $0.35/GB-month, no minimum (~$5–8 for us) | up to 7 days | Same database, a plan change |
| [Supabase](https://supabase.com/pricing) Free / Pro | $0 / $25 | none / 7 daily backups | Free pauses after a week without visits: not for a live site. Pro costs more than Neon Launch |
| Postgres on the VPS | $0 extra | what we build | Upgrades, tuning, replication and backups are ours |

### Email

| | Cost | Daily limit | Notes |
| --- | --- | --- | --- |
| [Resend](https://resend.com/pricing) Free / Pro | $0 / $20 for 50,000 | 100 / none | What we use; simplest |
| [Amazon SES](https://aws.amazon.com/ses/pricing/) | $0.10 per 1,000 | set by AWS | Cheapest at volume; an AWS account, and a request to leave the sandbox |
| [Brevo](https://www.brevo.com/pricing/) Free | $0 | 300 | Marketing-first; check its branding rules on the free plan |
| [ZeptoMail](https://www.zoho.com/zeptomail/pricing.html) | $2.50 per 10,000, prepaid, valid 6 months | none | Transactional only, by Zoho, strong in India; the first 10,000 free |

Changing provider is a change to the email adapter and three DNS records, half a day with testing.

## The plan

**For launch (before 8 November).** Nothing here moves hosting, the database or email without your
explicit OK.

1. **Move to Vercel Pro** before applications open: it makes PJK compliant, and it removes the
   Blob lockout. This is the one paid item that is plainly worth it. Set Spend Management to
   notify at $25.
2. **Stay on Neon Free**, now that encrypted nightly backups exist (RUNBOOK.md, "Backups"). Watch
   compute-hours in Neon's dashboard in the first weeks; if they pass 70 a month, move to Launch.
3. **Keep Resend Free** if you expect under ~80 emails on the busiest day. If you expect a rush
   when applications open, move to ZeptoMail first (with your OK): about ₹210 covers 10,000 emails.
4. **Keep the Google Maps key**, with quotas set (Google Cloud → APIs → Quotas: a daily cap per
   API) and a ₹500 budget alert, so it can never cost money; without it the form falls back to
   OpenStreetMap.
5. Keep files on Vercel Blob.

**After launch.** Review usage monthly for three months. Move media to R2 only if we leave Vercel
or storage passes ~50 GB. Reconsider Neon Launch if a 6-hour restore window ever feels short; the
nightly backups otherwise cover a day.

**Your current and planned paid items, once backups exist:**

- **Vercel Pro: yes.** Not for performance: Hobby is not allowed for a commercial site, and Hobby's
  Blob lockout would take KYC offline.
- **Neon Launch: not yet.** The nightly backups give a day's restore point and 8 weeks of
  history, which Launch's 7 days do not; Free's 6-hour window covers "undo the last hour". Buy it
  if compute-hours run short or you want minute-level restore beyond 6 hours.
- **Google Maps key: yes, at $0**, with quotas and a budget alert so it stays $0.

In your place I would pay for Vercel Pro from November, keep everything else free, and look again
in February with three months of real usage.

## Moving media to Cloudflare R2

Not done, and not needed yet. When it is, it takes settings and one script, no code change: every
file goes through `src/storage/objectStore.ts`, the public pictures through Payload's own S3 plugin
(`src/storage/mediaPlugin.ts`), and both plugins' upload components are always built in.

1. **Cloudflare → R2** → enable it (a card is required, even for the free allowance). Create two
   buckets, **private** both: `pjk-media` and `pjk-private`. The site serves every file itself, so
   neither needs public access.
2. **R2 → Manage API tokens → Create**: *Object Read & Write*, limited to those two buckets. Note
   the Access Key ID, the Secret Access Key and the endpoint
   (`https://<account id>.r2.cloudflarestorage.com`).
3. **CORS on `pjk-media`** (bucket → Settings → CORS), so the admin can upload large pictures
   straight to it: allow `PUT` from `https://pjk.co.in` with header `content-type`.
4. **Copy, on your computer.** In `.env` (never committed) set `S3_ENDPOINT`, `S3_REGION=auto`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_MEDIA_BUCKET=pjk-media`,
   `S3_PRIVATE_BUCKET=pjk-private`, and the Blob side: `BLOB_READ_WRITE_TOKEN` (Vercel → Storage →
   the media store → .env.local tab) for media; `vercel env pull --environment=production` for
   the private store's `KYC_STORE_ID` and a one-hour OIDC token, with `VERCEL_ENV=production`.
   Then `pnpm storage:copy media`, check the count, `pnpm storage:copy media --apply`; the same
   with `private`.
5. **Vercel → Settings → Environment Variables**, Production: the six `S3_*` values (the secret
   as Sensitive), then `MEDIA_STORAGE=s3` and `PRIVATE_STORAGE=s3`. Redeploy.
6. **Check**: the site's pictures show; in the admin, open a KYC document and an artist's picture,
   and upload a picture to Media.
7. **Copy once more** (`--apply`): it adds only files uploaded during the switch.
8. Leave the Blob stores for 30 days, then delete them in Vercel.

To go back, remove `MEDIA_STORAGE` and `PRIVATE_STORAGE` and redeploy. Files uploaded while on R2
stay only in R2 until copied back by hand, so decide within days, not weeks.
