# PAT and J.K. Co. — group website & brand platform

The website for **PAT and J.K. Co. (PJK)** at [pjk.co.in](https://pjk.co.in), and the shared platform that future brands in the group (starting with Phulhaar Gallery by PJK) will run on.

Everything visitors see is editable from the admin panel at `/admin` — pages, sections, ventures, people, journal posts, forms, navigation, logos and colours. Publishing a change updates the live site within seconds; no code changes or redeploys.

| Guide                                            | For                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [docs/SETUP.md](docs/SETUP.md)                   | Accounts, environment variables, DNS and deploying to production |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)       | Editors — how to manage content (plain language, no code)        |
| [docs/ADDING_A_BRAND.md](docs/ADDING_A_BRAND.md) | Launching another brand's website on this platform               |
| [docs/BRANDS.md](docs/BRANDS.md)                 | Each venture's palette, type and logo rules                      |

## Stack

- **Next.js 16** (App Router, React 19, TypeScript) — the public site, statically rendered and cached
- **Payload CMS 3** — admin panel, authentication, content API; runs inside the same Next.js app
- **PostgreSQL** — Neon in production, local Postgres in development
- **Tailwind CSS 4** — styling, driven by per-brand design tokens
- **Vercel** (hosting) · **Vercel Blob** (media) · **Resend** (email)

## How it works

```
Visitor → pjk.co.in/about
            │
            ▼
   src/proxy.ts  ── rewrites by hostname ──►  /tenant-sites/pjk.co.in/about
            │
            ▼
   app/(frontend)/tenant-sites/[host]/…   finds the brand for the host, renders its
            │                              page from CMS blocks, caches the result
            ▼
   Payload (Postgres)  ◄── editors publish at /admin ── afterChange hook purges the cache
```

- **Brands (tenants).** Each brand — PJK, and later Phulhaar Gallery, etc. — has its own domains, pages, journal, ventures, people, media, forms, redirects and site settings (logo, colours, navigation, footer). The [multi-tenant plugin](https://payloadcms.com/docs/plugins/multi-tenant) keeps their content separate; editors only see the brands assigned to them.
- **Page builder.** Pages are an ordered list of blocks (Hero, Page intro, Statement, Text, Image & text, Venture spotlight, Ventures grid, Principles, Quote, People grid, Journal feed, Openings list, Form, Call to action). Editors add, remove and reorder them.
- **Always fresh, always fast.** Pages are pre-rendered static HTML. Any change in the admin calls `revalidatePath('/', 'layout')` (see `src/hooks/revalidateFrontend.ts`), so the next visitor gets the updated page. Pages also refresh hourly as a safety net.
- **Design system.** A brand picks four colours (brand, background, paper, text) in Site settings; hairlines, hovers and muted text are derived from them in `globals.css`. Entirely serif: Cormorant Garamond for display, EB Garamond for text and small capitals. Woodland green is the ink on ivory; solid green is kept for the footer and feature plates.

## Local development

Requirements: Node 20.9+ (24 recommended), pnpm, and a Postgres database.

```bash
brew install pnpm postgresql@17 && brew services start postgresql@17
createdb pjk_dev
cp .env.example .env          # then fill in DATABASE_URL and the three secrets
pnpm install
pnpm seed                     # creates the PJK brand with all starter content
pnpm dev
```

- Site: <http://localhost:3000> (or <http://pjk.localhost:3000>)
- Admin: <http://localhost:3000/admin> — the **first account you create becomes the super admin**.

Unknown hostnames (like `localhost`) show the brand in `DEFAULT_TENANT_SLUG`. To preview another brand locally, add `<something>.localhost` to its domains and open `http://<something>.localhost:3000`.

### Scripts

| Command                                            | What it does                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                         | Development server (database schema syncs automatically)               |
| `pnpm seed` / `pnpm seed:reset`                    | Create the PJK starter content / wipe and recreate it                  |
| `pnpm build` · `pnpm start`                        | Production build and server                                            |
| `pnpm lint` · `pnpm typecheck`                     | ESLint and TypeScript                                                  |
| `pnpm test:int`                                    | Unit + integration tests (uses `DATABASE_URL`; cleans up after itself) |
| `pnpm test:e2e`                                    | Playwright browser tests against a seeded dev server                   |
| `pnpm generate:types`                              | Regenerate `src/payload-types.ts` after changing collections or blocks |
| `pnpm payload migrate:create <name>`               | Create a database migration after schema changes (see below)           |
| `pnpm brand:trace` · `brand:icons` · `brand:embed` | Vectorise a logo PNG, rebuild favicons/share image, embed brand SVGs   |

### Changing the schema

Development pushes schema changes straight to your local database. Production only changes through migrations:

1. Edit collections/blocks, run `pnpm generate:types`.
2. `pnpm payload migrate:create describe-the-change` — commit the new file in `src/migrations/`.
3. On deploy, Vercel runs `pnpm vercel-build` (`scripts/vercel-build.mjs`): migrations, then `next build`.
   Migrations run on **production** deploys only. A preview deploy skips them unless
   `MIGRATE_ON_PREVIEW=1` is set, which should only be done once Preview has its own database.

## Project map

```
src/
  proxy.ts                         hostname → brand routing
  payload.config.ts                CMS configuration
  collections/                     Pages, Posts (Journal), Ventures, People, Openings, Media,
                                   Categories, SiteSettings, Tenants (Brands), Users
  blocks/<Name>/config.ts          block fields (admin)   ─┐ listed in blocks/index.ts
  blocks/<Name>/Component.tsx      block rendering (site) ─┘ and blocks/RenderBlocks.tsx
  plugins/index.ts                 multi-tenant, forms, SEO, redirects, Blob storage
  app/(frontend)/tenant-sites/[host]/   public routes: /, /[slug], /ventures/[slug], /journal/[slug],
                                        sitemap.xml, robots.txt
  app/(payload)/                   admin panel & API (generated by Payload)
  components/                      header, footer, cards, typography, media
  seed/                            starter content for the PJK brand
  migrations/                      production database migrations
scripts/brand/                     logo tracing and icon generation
public/brand/                      traced PJK logo, wordmark, leaf ornament, share image
docs/                              setup, admin and new-brand guides
```

## Security notes

Full detail in [docs/SECURITY.md](docs/SECURITY.md).

- **Admin access needs three things:** a one-time code emailed to an `@pjk.co.in` mailbox, an account a super admin has approved, and the password. `src/proxy.ts` blocks `/admin` and every auth API until the code has been entered, so the sign-in screen is not even reachable from outside the company.
- Roles: **super admin** (everything) and **editor** (content for assigned brands). Only super admins create users, assign roles or brands, and manage domains; suspending an account blocks sign-in immediately.
- Every sign-in attempt, approval and refusal is recorded in the security log.
- Form submissions: honeypot + per-IP rate limit + server-side validation against the form's fields; enquiries are readable only by signed-in users of the owning brand.
- Drafts are only visible in the admin's authenticated preview. Security headers are set in `next.config.ts`.
