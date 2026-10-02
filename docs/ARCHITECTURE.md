# Architecture notes

Conventions and gotchas for anyone working on this codebase. Setup lives in
[SETUP.md](SETUP.md); the overview is in the [README](../README.md).

## Brands

Each brand is a Payload tenant (`@payloadcms/plugin-multi-tenant`). `src/proxy.ts` rewrites every
request to `/tenant-sites/<host>/…`, and `src/utilities/tenant.ts` resolves the hostname to a brand.

**Every frontend query must be scoped to a tenant** — always go through `src/utilities/queries.ts`
rather than calling Payload directly, so a brand can never leak another brand's content.

## Pages and blocks

Pages are built from blocks. To add one:

1. Create `src/blocks/<Name>/config.ts` (the admin fields) and `Component.tsx` (the rendering).
2. Register the config in `src/blocks/index.ts` and the component in `src/blocks/RenderBlocks.tsx`.
3. Run `pnpm generate:types`, then `pnpm payload migrate:create add-<name>-block`.

## Caching

Public pages are statically rendered. Content changes purge them through
`src/hooks/revalidateFrontend.ts` — **add that hook to any new collection that appears on the site**,
or edits to it will not show up until the hourly refresh.

Anything that changes per request therefore cannot be rendered with the page. The visitor count is
the one such thing: `src/components/VisitorCount.tsx` asks `/next/visits` once the page is open, and
that route increments the brand's row with a single `UPDATE … SET total = total + 1`, so two visits
at the same moment cannot overwrite each other. It stores nothing about the visitor by design, which
leaves session storage in the browser and a short per-address memory as the only guards against one
visit being counted twice.

## URLs

`src/utilities/docHref.ts` is the single source of truth: pages are `/slug`, journal posts are
`/journal/slug`, ventures are `/ventures/slug`. Slugs are unique **per brand**, not globally
(`src/fields/slug.ts` plus a `['tenant', 'slug']` unique index), so every brand can have its own
`home` and `about`.

## Members (artists and partners)

Staff and members are two separate Payload auth collections, and nothing about one carries over
to the other.

| | Staff (`users`) | Members (`members`) |
| --- | --- | --- |
| Sign in | Company mailbox code, then password (`/admin-access`) | Emailed code only; no passwords exist |
| Session | Payload's own token, 8 hours | `pjk_member` cookie, a week from last use, 30 days at most (`src/security/memberSession.ts`) |
| Reaches `/admin` | Yes, behind the gate | Never |
| Recognised by | Payload's JWT strategy | `src/security/memberStrategy.ts` |

**Access is decided by collection, never by "signed in".** Use `isStaff(user)` or
`isMember(user)` from `src/access/roles.ts`. `src/access/memberGuard.ts` wraps every collection
not listed in `MEMBER_COLLECTIONS`, so a member gets a visitor's access there; collections built
for members (`members`, `applications`, later `artworks`) are in that list and must check
ownership in their own rules. **A new member-owned collection must be added to the list and given
owner-only rules, with a test in `tests/int/members.int.spec.ts`.**

One-time codes for both audiences come from `src/security/challenges.ts`. A code is checked with
an atomic attempt reservation and spent with an atomic update, so parallel guesses and parallel
correct submissions are both safe.

**Member IDs** (`AT000001`, `PT000001`) are issued only on approval, from the Postgres sequences
`member_id_artist_seq` and `member_id_partner_seq`, inside the approval transaction
(`src/members/decide.ts`). Never compute one from existing rows. The sequences are declared in the
Drizzle schema through `afterSchemaInit` in `payload.config.ts`, which is what keeps development
push from dropping them. **Applications** carry a random reference (`APP-7K3Q9X`) from the first
step. Their `stage` (never `status`) is moved only by the server: a submission, or a staff
decision through `POST /api/applications/:id/decide`.

## Admin access

Reaching `/admin` requires a one-time code emailed to a company address; the check happens in
`src/proxy.ts` before any admin route runs. See [SECURITY.md](SECURITY.md) before changing anything
under `src/security/`.

## Design system

"Letterhead and catalogue": all-serif (Cormorant Garamond for display, EB Garamond for text and
small capitals), woodland green as the ink on ivory, sections with a label in the left margin
(`Section` in `src/components/Typography.tsx`), ruled lists instead of card grids, and no scroll
animations.

Where a photograph has not been uploaded, show a text-only layout rather than an empty placeholder.

A brand sets four colours; every other token is derived from them in
`src/app/(frontend)/globals.css` under `:root, .brand-theme`.

## Database

Development pushes schema changes automatically. Production only changes through migrations:
`pnpm payload migrate:create <name>`, then commit the generated file. Vercel runs `payload migrate`
before each build.

**Do not name a field `status` on a collection that has drafts** — it collides with Payload's own
`_status` enum in Postgres. (Ventures uses `stage` for this reason.)

## Before pushing

```bash
pnpm lint && pnpm typecheck && pnpm test:int && pnpm build
```

`test:int` uses the database in `DATABASE_URL` and cleans up after itself.

GitHub Actions runs the same checks on every push and pull request (`.github/workflows/ci.yml`),
plus two that need a fresh database: every migration must apply cleanly to an empty database, and
`payload migrate:create --skip-empty` must find nothing to write. If that second check fails, a
collection or block changed without a migration; create one and commit it.
