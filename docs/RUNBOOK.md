# Something broke: what to do

For when pjk.co.in is down, wrong, or misbehaving after a change. Read it once now, while
nothing is broken, so it is familiar when something is.

**The order, almost always:** stop the harm (roll back the site, or switch applications off),
then work out what happened, then fix it properly in a new pull request. Do not try to fix
forward under pressure.

## 1. Roll the site back to the last good version (two minutes)

Vercel keeps every deployment. Putting an older one back takes seconds, does not rebuild
anything, and does not touch the database.

1. Go to **vercel.com → pat-and-jk-co → Deployments**.
2. Find the last deployment that worked (section 2 below says how). Production deployments have a
   **Production** label; the live one also says **Current**.
3. Click the **⋯** menu at the right of that row → **Instant Rollback** (on older deployments the
   item may read **Promote to Production**). Confirm.
4. Within a minute pjk.co.in serves that version. Check `https://pjk.co.in/api/health`: it should
   say `"status":"ok"`, and its `"commit"` should be the first characters of the commit you rolled
   back to.

While rolled back, Vercel stops putting new deployments live by itself. When the fix is merged
and its deployment is ready, open it and choose **Promote to Production** (or **Undo Rollback**).

## 2. Finding the last good deployment

- **GitHub → Releases** lists every version that went live, newest first (`release-2026-10-13-1`
  is the first that day). Each says what changed since the one before. The release before the
  bad one is the last good one, unless it was itself the problem.
- In Vercel's **Deployments**, each row shows the commit message and time. Match the commit to the
  release.
- `/api/health` on the live site shows the commit that is live now.

## 3. Is a rollback safe? (Yes, almost always)

Rolling back changes the code, not the database. Migrations that already ran stay applied, so the
older code runs against the newer database. That works because of one rule: **migrations only
add things**. A release never drops or renames a column, table or enum value that the release
before it still uses; it first ships code that stops using it, and drops it in a later release.
CI enforces this (`scripts/check-migrations.mjs`), so for any release that passed CI, the release
before it can run against today's database.

When it is not safe:

- The bad release **deleted or rewrote data** (a data migration that went wrong). Rolling back
  the code does not bring data back: restore the database (section 4).
- Someone made a migration exception in `migrations-allow.txt`. Read its reason first.
- You are rolling back **more than one release**. Each release is safe against the one before;
  going back several is usually fine, but check none of the releases in between is in
  `migrations-allow.txt`.

With Vercel's Deployment Checks on (docs/SECURITY.md, "The gatekeeper"), a deployment whose checks
fail is never made live, but its migrations still ran when it was built. Because they only add
things, the live version is unaffected.

## 4. Restoring the database (Neon)

Only if data was lost or damaged. Rolling back the site does not need this.

**What the plan allows.** Neon keeps the history of every change for a window: **6 hours on the
Free plan, 7 days by default on Launch** (the plan is under Neon → Settings → Billing; moving to
Launch is in LAUNCH.md). Within that window you can go back to any moment; before it, nothing.
Check the window first: Neon → Settings → Storage / **History retention**.

**The safe way: look first, on a copy.**

1. Neon → your project → **Branches** → **Create branch**. Parent: `main`. Choose **Past data /
   point in time** and pick a moment just before the damage. Name it `restore-check`.
2. Open that branch in the **SQL Editor** and check the data is as it should be.
3. Then either:
   - **Copy back only what was lost**, with SQL, from `restore-check` into `main` (best when the
     damage is small: one table, some rows), or
   - **Restore `main` itself**: Neon → Branches → `main` → **Restore** → the same moment. Neon keeps
     a backup branch of the state just before the restore, so even this can be undone. Everything
     written after that moment is lost, so take a note of anything that happened since (new
     applications, sign-ups) first.
4. Delete `restore-check` when finished.

Before launch day and before any risky migration, take a snapshot: Neon → Branches → Create
branch from `main` at **Current data**, named like `snapshot-2026-11-07` (LAUNCH.md). It costs
nothing while it sits unused, and it outlasts the history window.

## 5. Switching applications off in an emergency

If applications themselves are the problem (spam, a broken step, a data leak in progress):

1. **Admin → Site settings → Applications** → untick **Applications are open** → Save. The
   application pages show the closed note straight away and the server refuses new applications
   and identity details. Signing in to existing accounts still works.
2. **If the admin will not load:** Neon → **SQL Editor**, branch `main`, run
   `UPDATE site_settings SET applications_open = false;` It takes effect on the next request.
3. **If the whole site must stop taking input:** roll back (section 1) to a release from before
   applications opened, or, as a last resort, Vercel → Settings → **Deployment Protection** →
   turn on Vercel Authentication for Production, which puts every page behind a Vercel login.
   Undo it as soon as you can.

## 6. Who to contact

| What | Who |
| --- | --- |
| Anything technical, first | tech@pjk.co.in |
| A data breach, or a complaint about personal data | yuvraj@pjk.co.in, the grievance officer. Under the DPDP Act a personal data breach must be reported to the Data Protection Board and the people affected without delay: talk to the lawyer the same day |
| The site's hosting | Vercel support (vercel.com/help), from the account that owns the project |
| The database | Neon support (console → Help) |
| Email not arriving | Resend dashboard → Logs, then resend.com support |
| Domain or DNS | GoDaddy, from the account that holds pjk.co.in |

Write down, as you go, what happened and when: the security log (Admin → Administration →
Security log) and Vercel's logs fill in the rest afterwards.
