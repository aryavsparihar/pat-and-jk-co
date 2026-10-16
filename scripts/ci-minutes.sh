#!/usr/bin/env bash
# Roughly how many GitHub Actions minutes this repository has used this calendar month, the way
# GitHub bills them: each job rounded up to a whole minute, skipped jobs free. Warns past 2,700 of
# the 3,000 a month GitHub Pro includes (docs/ARCHITECTURE.md, "CI minutes"). An estimate: the
# exact figure is under github.com → Settings → Billing, which needs the account owner.
#
#   scripts/ci-minutes.sh            this month
#   scripts/ci-minutes.sh 2026-10    a given month
set -euo pipefail

repo=${CI_MINUTES_REPO:-aryavsparihar/pat-and-jk-co}
month=${1:-$(date -u +%Y-%m)}
warn_at=2700
allowance=3000

total=0
runs=0
for id in $(gh api --paginate "repos/$repo/actions/runs?created=$month-01..$(date -u -j -v1d -v+1m -f %Y-%m-%d "$month-01" +%Y-%m-%d 2>/dev/null || date -u -d "$month-01 +1 month" +%Y-%m-%d)&per_page=100" --jq '.workflow_runs[].id'); do
  minutes=$(gh api "repos/$repo/actions/runs/$id/jobs" --jq '[.jobs[]
    | select(.started_at and .completed_at and .conclusion != "skipped")
    | (((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)) / 60 | ceil)
    | if . < 1 then 1 else . end] | add // 0')
  total=$((total + minutes))
  runs=$((runs + 1))
done

echo "$month: about $total minutes over $runs runs, of $allowance included."
if [ "$total" -ge "$warn_at" ]; then
  echo "WARNING: past $warn_at minutes. Push only what must be checked until the month resets."
  exit 2
fi
