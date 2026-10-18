#!/usr/bin/env bash
# Runs on the self-hosted Mac as each job starts (ACTIONS_RUNNER_HOOK_JOB_STARTED in each
# runner's .env; docs/RUNBOOK.md, "7. The CI runner on the Mac"). Two things:
#
# 1. It keeps the Mac from sleeping until the job ends: a sleeping Mac stops answering GitHub, and
#    after ten minutes GitHub fails the job with "The self-hosted runner lost communication with
#    the server". caffeinate holds the assertion until the job's worker process exits (-w), so
#    nothing stays awake afterwards; -i stops idle sleep, -s system sleep while on power. Closing
#    the lid still sleeps a laptop.
#
# 2. The Mac runs more than one runner, so jobs run side by side, but the browser tests (the e2e
#    job) all run the app on one port: they take turns, by a lock this hook takes and
#    job-completed.sh gives back. A lock whose job has gone is cleared.
worker="$PPID"
if ps -o command= -p "$worker" 2>/dev/null | grep -q 'Runner.Worker'; then
  nohup /usr/bin/caffeinate -i -s -w "$worker" >/dev/null 2>&1 &
else
  # Not started by the worker as expected: stay awake for the longest a job may take
  nohup /usr/bin/caffeinate -i -s -t 3600 >/dev/null 2>&1 &
fi
echo "Keeping the Mac awake until this job ends"

if [ "${GITHUB_JOB:-}" = "e2e" ]; then
  lock="$HOME/.pjk-ci-e2e.lock"
  until mkdir "$lock" 2>/dev/null; do
    holder=$(cat "$lock/worker" 2>/dev/null || true)
    if { [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; } ||
      { [ -z "$holder" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +2 2>/dev/null)" ]; }; then
      rm -rf "$lock"
      continue
    fi
    echo "Another browser-test job is running on this Mac; waiting for it to finish"
    sleep 15
  done
  echo "$worker" >"$lock/worker"
  echo "This job has the browser-test port"
fi
