#!/usr/bin/env bash
# Runs on the self-hosted Mac as each job starts (ACTIONS_RUNNER_HOOK_JOB_STARTED in the runner's
# .env; docs/RUNBOOK.md, "7. The CI runner on the Mac"). It keeps the Mac from sleeping until the
# job ends: a sleeping Mac stops answering GitHub, and after ten minutes GitHub fails the job with
# "The self-hosted runner lost communication with the server".
#
# caffeinate holds the assertion until the job's worker process exits (-w), so nothing stays awake
# afterwards. -i stops idle sleep, -s stops system sleep while on power. Closing the lid still
# sleeps a laptop; so does a battery that runs out.
worker="$PPID"
if ps -o command= -p "$worker" 2>/dev/null | grep -q 'Runner.Worker'; then
  nohup /usr/bin/caffeinate -i -s -w "$worker" >/dev/null 2>&1 &
else
  # Not started by the worker as expected: stay awake for the longest a job may take
  nohup /usr/bin/caffeinate -i -s -t 3600 >/dev/null 2>&1 &
fi
echo "Keeping the Mac awake until this job ends"
