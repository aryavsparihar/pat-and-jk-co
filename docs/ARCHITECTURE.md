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
for members (`members`, `applications`, `portfolio-images`) are in that list and must check
ownership in their own rules. **A new member-owned collection must be added to the list and given
owner-only rules, with a test in `tests/int/members.int.spec.ts`.**

One-time codes for both audiences come from `src/security/challenges.ts`. A code is checked with
an atomic attempt reservation and spent with an atomic update, so parallel guesses and parallel
correct submissions are both safe.

**One person, one member record, one sign-in**, whatever they apply for. Someone can be both an
artist and a partner: they hold one application of each kind (unique on member and type), and the
member record has a slot for each ID, `artistId` and `partnerId`.

**Member IDs** (`AT000001`, `PT000001`) are issued only on approval, into the slot for that kind, from the Postgres sequences
`member_id_artist_seq` and `member_id_partner_seq`, inside the approval transaction
(`src/members/decide.ts`). Never compute one from existing rows. The sequences are declared in the
Drizzle schema through `afterSchemaInit` in `payload.config.ts`, which is what keeps development
push from dropping them. **Applications** carry a random reference (`APP-7K3Q9X`) from the first
step. Their `stage` (never `status`) is moved only by the server: a submission, or a staff
decision through `POST /api/applications/:id/decide`.

## Admin dialogs

Actions that need a reason or a confirmation in the admin (revealing KYC, downloading a document,
recording a withdrawal, a legal hold, approving a bank change) use `useActionDialog`
(`src/components/admin/ActionDialog.tsx`), never the browser's `prompt()` or `confirm()`: a
native `<dialog>` in the admin's colours, a required reason (the action stays disabled until it is
long enough; the server checks again), Cancel, and Esc to cancel. It is not a `<form>`, because
Payload renders sidebar fields inside its own document form and forms cannot nest.

## KYC

Identity and bank details are their own collections, `kyc-records` and `kyc-documents`, not
fields on members or applications, so no member, editor or public rule can reach them by
accident. Only `isKycReviewer` (super admins and the `kyc-reviewer` role) reads them, through the
admin; nothing creates or edits them except `src/kyc/service.ts`, which is the only importer of
`src/kyc/crypto.ts`. Both are `import 'server-only'`.

Two things to know when changing it:

- **Collection configs must not import the KYC service at the top.** The Payload CLI (and so
  `payload migrate` on deploy) loads the configs under plain Node, where `server-only` throws.
  Endpoints load it with `await import('../kyc/service')` inside the handler. The maintenance
  scripts (`pnpm kyc:purge`, `pnpm kyc:rotate-key`) run with `scripts/allow-server-only.mjs`, and
  the tests alias it in `vitest.config.mts`.
- **Every new sealed value needs a context** naming its member and field, and must be added to
  the reveal, rotation and purge paths. `tests/int/kyc.int.spec.ts` checks the database never
  holds the plaintext.

See [KYC.md](KYC.md) for the design and its threat model.

## The member portal

An approved artist's account (`/account`, `/account/profile`, `/account/works`, `/account/payouts`,
`/account/settings`); an approved partner sees their standing, PT ID and contact details; an
applicant sees only their applications. Pages load the member with `src/members/accountPage.ts`;
every write goes through `/next/members/portal/*` (`src/members/portalHttp.ts`: signed in, same
origin, rate limited, and refused with 423 while the account is on hold), never Payload's API.

**Review before public.** Members edit a working copy of their profile; staff approval publishes
a snapshot (`publicProfile`), and only the snapshot is ever read for the public. The pattern lives in `src/members/reviewFields.ts`; it is not
Payload's drafts, so no field is called `status`.

**One interface for every file.** Public media, KYC documents and artists' private pictures all go
through `src/storage/objectStore.ts`: Vercel Blob today, an S3-compatible store (Cloudflare R2,
Backblaze B2) by setting (`MEDIA_STORAGE`, `PRIVATE_STORAGE`), local disk in development. The public
`media` collection uses Payload's own Vercel Blob or S3 plugin accordingly
(`src/storage/mediaPlugin.ts`); both add the same fields and both upload components are always in
the import map, so the switch is configuration plus `pnpm storage:copy` (COSTS.md).

**Pictures are private.** Artists' pictures (portfolio images, works and portraits) are kept in the
private Blob store, in a `media/` folder beside KYC's `kyc/` one, reached with the deployment's own
OIDC token (`src/storage/privateMedia.ts`, `memberMediaAdapter.ts`). Locally they live in
`.uploads/media`. Payload's file route serves them after the read rule, which admits staff and the
picture's owner only, with headers that keep them out of every cache but the viewer's. Nothing goes
through a public URL, the image optimiser or the CDN.

Pictures are made at most 2400 px in the browser (`sendPicture.ts`) and sent through the server,
which checks and re-encodes them. Only the picture and its 400 px thumbnail are written; Payload's
1600 px size is skipped, as each file written counts against the free plan. Pictures uploaded before
this move from the public store the first time they are asked for, or all at once with
`pnpm media:make-private --apply`.

**Works come by Google Drive.** To stay on the free plan, artists upload no works here. Each
approved artist gives one Google Drive folder link (`worksFolder` on the member, set through
`/next/members/portal/works-folder`, only ever as a canonical `drive.google.com/drive/folders/<id>`
link). Everything about a work, its pictures, video and description, is in a folder named after
it inside that one; the site keeps no works collection (the old `artworks` table is left in the
database until a later release drops it, so a rollback still runs). Pictures staff add in the
admin are cleaned by `PortfolioImages`' `beforeOperation` hook as the portal's uploads are.

**Every write is in the security log.** `src/security/audit.ts`, the last plugin, adds
`afterChange` and `afterDelete` hooks to every collection but the log's own bookkeeping, writing
`record-created`, `record-changed` (field names only; choices as "from → to") and `record-deleted`
with who did it: `req.user`, or, for a server write made on someone's behalf with
`overrideAccess`, `context: actingFor(member, 'members')`. Pass that context on any new write made
for a member or a member of staff, or the log says "by the site".

`public` on a picture still marks the approved portrait (`syncPublicImages`, after every profile
approval). It no longer makes them readable: anything
shown to the public will be a copy made when it is published.

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

**Do not give a field the name of a relationship plus `Id`.** A relationship called `member` is
stored in the column `member_id`, and so is a text field called `memberId`; Payload silently lets
the second replace the first, and the relationship loses its foreign key. Applications use
`issuedId` for this reason. Read the generated migration's `CREATE TABLE` before committing it.

## Before pushing

```bash
pnpm lint && pnpm typecheck && pnpm test:int && pnpm build
```

`test:int` uses the database in `DATABASE_URL` and cleans up after itself.

GitHub Actions runs the same checks on every push and pull request (`.github/workflows/ci.yml`),
plus two that need a fresh database: every migration must apply cleanly to an empty database, and
`payload migrate:create --skip-empty` must find nothing to write. If that second check fails, a
collection or block changed without a migration; create one and commit it.

### CI minutes

The repository is private, and GitHub's own runners bill by the minute once the month's included
minutes are gone. Since October 2026, **CI runs on two GitHub runners on the founder's Mac**, which
cost nothing. Each job gets a throwaway database in the Mac's PostgreSQL 17
(`.github/scripts/ci-database.sh`), dropped when the job ends. Two jobs run side by side, except
that the browser tests take turns, as they share a port (`.github/runner/job-started.sh`); a code
pull request takes about 15 minutes.

- **Where jobs run** is one repository variable, `CI_RUNS_ON` (GitHub → Settings → Secrets and
  variables → Actions → Variables): `["self-hosted","pjk-mac"]` for the Mac. Delete it, and every
  job runs on GitHub's `ubuntu-latest` again, unchanged. The workflows work on both.
- **Dependabot's pull requests always run on GitHub's runners**, never on the Mac: they install
  package code nobody has reviewed yet. They come once a month, within the free minutes.
- **The daily backup** runs on the Mac too, at noon India time rather than at night, when the Mac
  is usually awake; if it is not, the job waits for it (RUNBOOK.md, "Backups").
- **The Mac must be awake** for a pull request to be checked; until then its checks wait in the
  queue (GitHub gives up after a day), and so does Vercel's release, which waits for them.
- The scanners the security jobs use on the Mac (gitleaks, Trivy, Semgrep) are the copies installed
  there, checked against the exact versions the workflow pins. Updating one means updating the pin
  and the Mac together.

Setting the runners up again, stopping them, or moving them to another machine: RUNBOOK.md, "7.
The CI runners on the Mac".

Wherever it runs, CI spends only where it proves something:

- **One run per pull request.** Run the checks above locally, and push a pull request once, when it
  is ready. Each push to an open pull request cancels the run before it.
- **Documentation-only changes** (`docs/`, `*.md`) skip the heavy jobs.
- **After merging,** the run on `main` skips the heavy jobs when the merge holds exactly the code
  the pull request's run tested and passed (the same git tree). It still has to report, as Vercel
  waits for these checks before a release goes live (docs/SECURITY.md, "The gatekeeper").
- **Security:** the secret scan runs every time. The dependency and code scans run when code or
  dependencies changed, and in full every Monday.
- **Dependabot:** one pull request a month for all npm updates, one a month for all GitHub Actions.

`.github/scripts/scope.sh` makes these decisions, and it fails safe. Every required job (verify,
e2e, Secret scan, Dependency, secret and config scan, Code scan (Semgrep)) still runs and reports
under its own name. When there is nothing to prove, it skips its steps and passes in seconds; when
anything is unclear, it runs everything.

To see how many of GitHub's own minutes the month has used:

```bash
scripts/ci-minutes.sh
```

## Tests

| | What | Runs against |
| --- | --- | --- |
| `pnpm test:int` | Integration tests (`tests/int`, Vitest): the route handlers, access rules, KYC encryption, the e-Aadhaar check, the portal | `DATABASE_URL`, cleaning up after itself |
| `pnpm test:e2e` | End-to-end tests (`tests/e2e`, Playwright) in a real browser: an artist applying step by step and coming back, PAN with a masked e-Aadhaar, another ID, a partner, signing in with a code, staff approving an application, an approved artist adding a work, a pending one kept out, a bank change stopped from the email's link, and staff and member sessions in one browser | the app as `pnpm dev` (on port 3000, or `E2E_PORT`), and the same database |

**End-to-end tests** do outside the browser what a person would: `tests/helpers/e2e.ts` sets the
code "in the email" to a known one, signs staff in the way Payload does (no password or email
code), and opens applications for the run and closes them again. Everyone they make is at
`@e2e.example.test` and is removed afterwards. Locally, to use a Chromium you already have rather
than Playwright's download, set `PLAYWRIGHT_CHROMIUM_PATH`.

**In CI** (`.github/workflows/ci.yml`) the `verify` job runs lint, typecheck, the migrations on an
empty database, the drift check, the integration tests and the build; the `e2e` job runs the
end-to-end tests against a second throwaway Postgres, migrated and seeded first, and keeps the
Playwright report when something fails. **No test may be skipped in CI**: a reporter
(`tests/helpers/noSkippedTests.ts`) fails the run and names any test that did not run.

**Switching branches locally.** Development pushes the schema straight to your database, so after
running a branch with more tables, a branch with fewer finds tables it would drop and stops to ask
"Accept warnings and push schema to database? (y/N)". Under the tests nobody answers: a file's setup
times out and its tests are skipped (and fail the run). Run the newer branch, or answer the prompt
in `pnpm dev` if you mean to drop them.

