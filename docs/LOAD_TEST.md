# Load testing

Three short k6 tests that check the site holds up at launch-day traffic: people reading the
public pages, artists applying, and a burst on the health check. They run against a **Preview
deployment and the Preview database, never production**: a load test on pjk.co.in would be a
small denial of service against the live site, and the application test writes records.

The scripts are in `load-tests/`. k6 is free and runs on your own machine (`brew install k6`).

## What each test does

| Test | Load | Passes when |
| --- | --- | --- |
| `browse.js` | 50 people reading the public pages, 1 to 4 seconds between pages, for 3 minutes | under 1% errors, 95% of pages in under 1.5 s |
| `apply.js` | 20 artists saving About you, Where you live and Your practice, and asking for their identity code; alongside, 10 sign-in code requests a minute for addresses that do not exist | under 1% errors, 95% of saves in under 2.5 s |
| `health.js` | `/api/health` rising to 100 requests a second for 30 seconds | under 1% errors, 95% in under 0.8 s |

Every number can be changed when running: `-e VUS=`, `-e DURATION=` (browse), `-e ARTISTS=`,
`-e ROUNDS=`, `-e THINK=`, `-e SIGNIN_PER_MINUTE=` (apply), `-e RATE=` (health).

The application test cannot receive emailed sign-in codes, so its artists are made beforehand,
already signed in, by `pnpm load-test:sessions`. Their addresses end `@load-test.invalid`, a domain
that can never receive email. The code-request part asks for codes for addresses with no account,
so the app answers but sends nothing, and uses Cloudflare's Turnstile test keys, which Preview
already has.

## The Firewall rule

The one Vercel Firewall rule denies an IP more than 100 POSTs to `/next/` in 60 seconds
(LAUNCH.md). k6 runs from one machine, so all its traffic comes from one IP.

- `browse.js` and `health.js` send only GETs, which the rule does not count.
- `apply.js` waits as a person does between steps. With `THINK=4` (the default) twenty artists
  send about 80 POSTs a minute, under the limit, and that is still faster than real artists, who
  spend minutes on each step. **No Firewall change is needed for the tests as written.**
- Only if you want the application test faster (`THINK=1`, about 320 a minute) would the rule need
  narrowing for the test, by adding *and Hostname is pjk.co.in* (and www) to its conditions so it
  covers production only, then removing that condition afterwards. That is your decision; nothing
  here changes the Firewall.

The app's own limits still apply and are part of what is being tested: 120 saves an hour per
artist, 30 identity codes an hour per artist, and 20 sign-in codes an hour per IP. The code-request
part therefore sees `429` after its first 20 requests; the test counts that as the limit working,
not as a failure.

## Running it

Before you start:

1. **A Preview deployment** of the branch to test (push it; Vercel builds it). Note its URL, like
   `https://pat-and-jk-co-git-branch-….vercel.app`.
2. **Deployment Protection bypass.** Previews need a Vercel login. Vercel → the project →
   **Settings → Deployment Protection → Protection Bypass for Automation** → create a secret. It is
   free on every plan. The tests send it as the `x-vercel-protection-bypass` header. Keep it out of
   any file; pass it on the command line as below, and delete it in the same place afterwards.
3. **Applications open on the Preview database only.** The identity-code step is refused while
   applications are closed. Open the Preview deployment's admin → Site settings → Applications →
   tick *Applications are open*. This is the Preview database; production is not touched.
4. **The Preview database's connection string**, from Neon → the `preview` branch → Connect (the
   owner string is fine for making test artists). Paste it only into your own terminal.

Then, from `website/`:

```bash
export BASE_URL='https://<the preview URL>'
export VERCEL_BYPASS='<the bypass secret>'
```

```bash
LOAD_TEST_DATABASE_HOST='<host from the Preview connection string>' DATABASE_URL='<Preview connection string>' MEMBER_SESSION_SECRET='<Preview value of MEMBER_SESSION_SECRET>' PAYLOAD_SECRET='<Preview value of PAYLOAD_SECRET>' pnpm load-test:sessions 20
```

`LOAD_TEST_DATABASE_HOST` must repeat the host in the connection string (the part after `@` and
before the next `/` or `:`); typing it is the check that this is the database you mean. The two
secrets must be the Preview deployment's own, so the sessions it makes are ones Preview accepts
(Vercel → Settings → Environment Variables; sensitive values can only be copied when they are
edited, so if they cannot be read, set new Preview-only values and redeploy the preview first).
The sessions count as recently signed in for 30 minutes, so start the application test within
that time.

```bash
k6 run load-tests/browse.js
```

```bash
k6 run load-tests/apply.js
```

```bash
k6 run load-tests/health.js
```

Each prints a summary; a line with ✗ is a threshold missed. Add `--summary-export
load-tests/results/<name>.json` to keep the numbers (the folder is gitignored).

Afterwards:

```bash
LOAD_TEST_DATABASE_HOST='<host>' DATABASE_URL='<Preview connection string>' MEMBER_SESSION_SECRET='<same>' PAYLOAD_SECRET='<same>' pnpm load-test:sessions --remove
```

Then close applications again on Preview if you like, and delete the bypass secret in Vercel.

## While it runs, watch

- Vercel → the preview deployment → **Logs**: errors, and function durations.
- Neon → the `preview` branch → **Monitoring**: connections and CPU. Free Neon compute scales to
  0.25–2 CU; a sustained 2 CU means the database is the limit.
- The security log (Preview admin → Administration → Security log): rate-limit entries from the
  code-request test are expected. An alert email for rate limits may reach tech@pjk.co.in if
  Preview sends email; that is the alert working.

## Results

**Local dry run, 14 October 2026** (a production build on this machine, against the local database,
small numbers, to prove the scripts work; not a measure of Vercel or Neon):

| Test | Run | Result |
| --- | --- | --- |
| browse | 5 people, 20 s | 90 pages, 0 errors, p95 66 ms |
| health | rising to 20 a second | 800 requests, 0 errors, p95 5 ms |
| apply | 5 artists, one round; 6 code requests a minute | every read and save 200, p95 59 ms; code requests answered; identity code refused with 403 because applications are closed in the local database, which is the app working (on Preview, open them first, step 3) |

**Preview run:** not yet run. It needs the bypass secret (step 2), which only you can create. Add
the three summaries here when it has run.

## Never

- Never point `BASE_URL` at pjk.co.in or any production domain.
- Never run `pnpm load-test:sessions` with the production connection string.
- Never commit `load-tests/sessions.json`: it holds live sessions for the test artists (it is
  gitignored, and `--remove` empties it).
