#!/usr/bin/env bash
# Runs on the self-hosted Mac as each job ends (ACTIONS_RUNNER_HOOK_JOB_COMPLETED): gives back the
# browser-test lock that job-started.sh took, if this job holds it.
if [ "${GITHUB_JOB:-}" = "e2e" ]; then
  lock="$HOME/.pjk-ci-e2e.lock"
  [ "$(cat "$lock/worker" 2>/dev/null)" = "$PPID" ] && rm -rf "$lock"
fi
exit 0
