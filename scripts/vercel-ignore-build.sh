#!/usr/bin/env bash
# Vercel's Ignored Build Step (vercel.json, "ignoreCommand"): exit 0 skips the deployment, exit 1
# builds it. Every deployment keeps a copy of the app's functions (about 40 MB), and those copies
# are what fill Vercel's function storage, so deployments nobody will open are not made:
#
#   - previews of Dependabot's branches: CI tests them, and the merge to main is built as usual
#   - changes to docs, Markdown files and GitHub's own settings only: they change nothing on the site
#
# Anything uncertain builds: a first deployment of a branch, a last deployment beyond the clone's
# history, a redeploy with no change, or any error. The optional argument is the commit to judge
# (HEAD by default), for trying the script out on older commits.
set -u

commit="${1:-HEAD}"

if [[ "${VERCEL_ENV:-}" == "preview" && "${VERCEL_GIT_COMMIT_REF:-}" == dependabot/* ]]; then
  echo "Skipping: a Dependabot branch (${VERCEL_GIT_COMMIT_REF}). CI tests it; main is built after the merge."
  exit 0
fi

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [[ -z "$base" ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "Building: no earlier deployment of this branch to compare with."
  exit 1
fi

if ! changed="$(git diff --name-only "$base" "$commit")"; then
  echo "Building: could not compare with the last deployment."
  exit 1
fi
if [[ -z "$changed" ]]; then
  echo "Building: nothing changed since the last deployment (a redeploy)."
  exit 1
fi

if grep -qvE '^(docs/|\.github/)|\.md$|^LICENSE$' <<<"$changed"; then
  echo "Building: the site's code or settings changed."
  exit 1
fi

echo "Skipping: only docs changed since the last deployment:"
echo "$changed"
exit 0
