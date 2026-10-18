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

## 4a. Backups

Every day at 12:00 India time, GitHub Actions (`.github/workflows/backup.yml`) takes a full
`pg_dump` of production, checks it reads back, encrypts it with your **public** age key, and uploads
it to the Google Drive folder **PJK database backups**: `daily/` keeps 14 days, `weekly/` (each
Sunday) keeps 8 weeks. Drive and GitHub only ever hold ciphertext; the private key is offline with
you, and nothing can be restored without it. If a day fails, tech@pjk.co.in is emailed with a
link to the run. The job takes about two minutes.

It runs on the CI runner on the founder's Mac (section 7), since GitHub's own runners need paid
minutes, using the Mac's `pg_dump` 18, `age` and `rclone` (Homebrew). If the Mac is asleep at noon,
the job waits, for up to a day, and runs as soon as it wakes; the unencrypted dump exists on the Mac
only for the seconds between dumping and encrypting. Deleting the `CI_RUNS_ON` variable moves it
back to GitHub's runners with everything else.

What a backup holds: the whole database, KYC records included (still encrypted with
`KYC_ENCRYPTION_KEY`). It does not hold files: KYC documents and pictures live in Blob storage, and
artists' originals in their Drive folders.

Deleted data (an erased person, a purged KYC record) stays in the encrypted backups until they
age out, at most 8 weeks; KYC.md and the privacy notice say so.

### Restoring from a backup

Use this when Neon's own history (section 4) no longer reaches back far enough. Never restore over
production directly: restore into a throwaway branch, look, then copy back only what you need.

1. Download the copy you want from Drive (**PJK database backups → daily** or **weekly**).
2. **Neon → Branches → Create branch** from `main` named `restore-check`. Then in that branch,
   **Databases → New database** named `restored`, owner `neondb_owner`. Copy its connection
   string (**Connect**, role `neondb_owner`, pooling **off**).
3. On your computer, with your key file (the one `age-keygen` made) and the PostgreSQL 18 tools
   the backups are made with (`brew install age libpq`; the script finds Homebrew's libpq even if
   an older PostgreSQL is installed), from the `website` folder:

   ```bash
   read -rs TARGET   # paste the connection string; it is not shown or saved
   scripts/restore-backup.sh ~/Downloads/pjk-2026-11-20.dump.age ~/path/to/pjk-backup-key.txt "$TARGET"
   ```

   It restores in one transaction (all or nothing) and prints how many tables, members,
   applications, works and log entries came back, and the newest log entry.
4. Look in the SQL Editor (branch `restore-check`, database `restored`), copy back what was lost
   with SQL, then delete the branch.

A backup still holds anyone deleted since it was made. Never copy such a person back: check the
live security log for `member-erased` and `staff-erased` entries since the backup's date, and leave
those people out (or erase them again with **Delete this person**).

**Test a restore every three months**, and once now: steps 1–3 with last night's copy, checking the
counts against the admin. A backup nobody has restored is a hope, not a backup.

### Setting up the backups

Once, in this order. Nothing here costs money.

1. **Your key pair**, on your Mac: `brew install age`, then
   `age-keygen -o ~/pjk-backup-key.txt`. It prints `Public key: age1…`. Keep the file **offline**:
   in your password manager and on paper or a USB stick somewhere safe. Never upload it, email it
   or put it in GitHub or Vercel. Lose it and the backups are unreadable; that is the point.
2. **GitHub → the repository → Settings → Environments → New environment** `backups`. Under
   **Deployment branches and tags** choose *Selected branches*, add `main`. Only the nightly job on
   `main` can then read its secrets. In it add:
   - variable `BACKUP_AGE_RECIPIENT`: the `age1…` public key;
   - secret `BACKUP_DATABASE_URL`: Neon → **Connect**, branch `main`, role `neondb_owner`,
     **pooling off**, copied exactly as Neon shows it (its `sslmode=require` is right for
     `pg_dump`; `verify-full` would need certificates the backup job does not have);
   - secret `BACKUP_ALERT_RESEND_KEY`: Resend → API Keys → Create, *Sending access* only, domain
     `pjk.co.in`.
3. **Google**, signed in to the Google account that should hold the backups (2-step verification
   on):
   1. [console.cloud.google.com](https://console.cloud.google.com) → new project **PJK backups**.
   2. **APIs & Services → Library → Google Drive API → Enable**.
   3. **Google Auth Platform → Branding**: app name *PJK backups*, your email. **Audience**:
      External. **Data access → Add scopes**: `…/auth/drive.file` only (it sees only the files it
      creates). Then **Audience → Publish app**. Publishing matters: while an app is in *Testing*,
      Google expires its access every 7 days and the backups would stop. `drive.file` needs no
      verification by Google.
   4. **Clients → Create client → Desktop app**. Copy the client ID and secret.
   5. On your Mac: `brew install rclone`, then
      `rclone config create gdrive drive client_id=<the ID> client_secret=<the secret> scope=drive.file`.
      A browser opens; sign in and allow (Google may say the app is unverified: **Advanced → Go to
      PJK backups**). Then `rclone config show gdrive` and copy the whole `token = {…}` value.
   6. In the GitHub `backups` environment add secrets `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`
      and `GDRIVE_TOKEN` (the `{…}` JSON). You can then delete the local rclone config.
4. **Run it once**: GitHub → Actions → **Backup** → *Run workflow* on `main`. In about two minutes
   **PJK database backups/daily** appears in Drive with one file. Then do the restore test above.

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

## 7. The CI runner on the Mac

CI runs on a GitHub Actions runner on the founder's Mac (docs/ARCHITECTURE.md, "CI minutes"). It
is installed in `~/actions-runner-pjk` as `pjk-mac`, and starts by itself when the founder logs in.
It needs the Mac awake and Homebrew's PostgreSQL 17 running (`brew services start postgresql@17`).

**Sleep.** While a job runs, the runner keeps the Mac awake (`.github/runner/job-started.sh`,
copied to `~/actions-runner-pjk/hooks/` and named in the runner's `.env` as
`ACTIONS_RUNNER_HOOK_JOB_STARTED`), and lets it sleep again when the job ends. Closing the lid still
sleeps it, and GitHub then fails the job after ten minutes ("lost communication with the server");
re-run it once the Mac is open. If the hook script changes, copy it to the hooks folder again.

**Is it running?** GitHub → the repository → Settings → Actions → Runners shows `pjk-mac` as Idle
or Active. Or:

```bash
gh api repos/aryavsparihar/pat-and-jk-co/actions/runners -q '.runners[] | "\(.name) \(.status)"'
```

**Stop it, or start it again:**

```bash
cd ~/actions-runner-pjk && ./svc.sh stop
```

```bash
cd ~/actions-runner-pjk && ./svc.sh start
```

**Checks waiting while the Mac is away?** Either wake the Mac, or send everything to GitHub's
runners for a while by deleting the `CI_RUNS_ON` variable (Settings → Secrets and variables →
Actions → Variables). That uses GitHub's minutes; put the variable back afterwards, with the value
`["self-hosted","pjk-mac"]`.

**Set it up again** (a new Mac, or after removing it): download the macOS ARM64 runner from
[github.com/actions/runner/releases](https://github.com/actions/runner/releases) and check its
SHA-256 against the release notes, unpack it into an empty `~/actions-runner-pjk`, then:

```bash
cd ~/actions-runner-pjk && ./config.sh --url https://github.com/aryavsparihar/pat-and-jk-co --token "$(gh api -X POST repos/aryavsparihar/pat-and-jk-co/actions/runners/registration-token -q .token)" --name pjk-mac --labels pjk-mac --work _work --unattended --replace && ./svc.sh install && ./svc.sh start
```

Then put the keep-awake hook back (from a checkout of the repository):

```bash
mkdir -p ~/actions-runner-pjk/hooks && cp .github/runner/job-started.sh ~/actions-runner-pjk/hooks/ && echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOME/actions-runner-pjk/hooks/job-started.sh" >> ~/actions-runner-pjk/.env && cd ~/actions-runner-pjk && ./svc.sh stop && ./svc.sh start
```

The Mac also needs gitleaks 8.30.1 and Trivy 0.75.0 (Homebrew) and Semgrep 1.180.0
(`pipx install semgrep==1.180.0`): the security jobs refuse other versions.

**Remove it for good:** `./svc.sh stop && ./svc.sh uninstall`, then remove the runner under
Settings → Actions → Runners, and delete the `CI_RUNS_ON` variable.

