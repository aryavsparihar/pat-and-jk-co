#!/usr/bin/env bash
# Decides whether a workflow run needs its heavy jobs, to spend as few Actions minutes as possible
# while every required check still reports (docs/ARCHITECTURE.md, "CI minutes"). Writes
# `heavy=true|false` and `reason=…` to $GITHUB_OUTPUT. The jobs always run and report success or
# failure under their usual names; when heavy is false they skip their steps and pass in seconds.
#
#   pull request   heavy unless every changed file is documentation (docs/, *.md)
#   push to main   not heavy when the merge commit holds exactly the code the pull request's run
#                  tested and passed (the same tree); otherwise heavy. Vercel waits for these
#                  checks on main before a release goes live, so they must report, but running
#                  everything twice on identical code proves nothing new
#   anything else  heavy (the weekly scheduled run, a manual run)
#
# Usage: scope.sh <workflow name>. Needs GH_TOKEN, with actions and pull-requests read.
#
# Fails safe: anything unexpected (an API error, a missing artifact) leaves heavy=true, and the
# workflows run their heavy steps unless this says "false" in so many words.
set -uo pipefail

workflow="$1"
heavy=true
reason="a full run"
tree=$(git rev-parse 'HEAD^{tree}')

documentation_only() {
  local files
  files=$(cat)
  [ -n "$files" ] && ! grep -qvE '(^docs/|\.md$)' <<<"$files"
}

case "${GITHUB_EVENT_NAME}" in
  pull_request)
    number=$(jq -r .pull_request.number "$GITHUB_EVENT_PATH")
    if files=$(gh api --paginate "repos/$GITHUB_REPOSITORY/pulls/$number/files" --jq '.[].filename') &&
      documentation_only <<<"$files"; then
      heavy=false
      reason="only documentation changed"
    fi
    # What this run tests, so the run on main after merging can tell it has nothing new to test
    echo "$tree" >tested-tree.txt
    ;;
  push)
    pr_head=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls" --jq '.[0].head.sha // empty' 2>/dev/null || true)
    if [ -n "$pr_head" ]; then
      # The newest successful run of this workflow for the pull request's last commit
      run=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?head_sha=$pr_head&event=pull_request&status=success&per_page=20" \
        --jq "[.workflow_runs[] | select(.name == \"$workflow\")][0].id // empty" 2>/dev/null || true)
      if [ -n "$run" ] && gh run download "$run" -R "$GITHUB_REPOSITORY" -n tested-tree -D tested 2>/dev/null; then
        if [ "$(cat tested/tested-tree.txt)" = "$tree" ]; then
          heavy=false
          reason="the same code passed in run $run, on the pull request"
        else
          reason="main changed after run $run tested the pull request"
        fi
      fi
    fi
    ;;
esac

echo "heavy=$heavy" >>"$GITHUB_OUTPUT"
echo "reason=$reason" >>"$GITHUB_OUTPUT"
echo "### $workflow: ${reason}" >>"$GITHUB_STEP_SUMMARY"
echo "heavy=$heavy ($reason)"
