#!/usr/bin/env bash
# A throwaway PostgreSQL 17 database for one CI job, wherever the job runs (docs/ARCHITECTURE.md,
# "CI minutes"):
#
#   GitHub's Linux runners   a postgres:17 container, gone with the runner
#   the self-hosted Mac      a database of its own in the Mac's PostgreSQL 17 (Homebrew), named
#                            after the run and job, and dropped by "ci-database.sh drop" at the end
#
# Either way the job gets DATABASE_URL, for an owner role that, as in the container, can create
# roles (the migrations add the app's group role), and APP_DATABASE_URL, for the app's own login
# role, pjk_app_ci, which the job adds to that group once the migrations have made it. Nothing
# here is a real secret.
#
#   .github/scripts/ci-database.sh create <name>     writes both URLs to $GITHUB_ENV
#   .github/scripts/ci-database.sh drop              removes the Mac's database again
set -euo pipefail

action="${1:?create or drop}"
owner=pjk
password=pjk

if [[ "$(uname -s)" == "Linux" ]]; then
  [[ "$action" == drop ]] && exit 0
  name="${2:?database name}"
  docker run -d --name pjk-postgres -p 5432:5432 \
    -e POSTGRES_USER="$owner" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB="$name" \
    postgres:17 >/dev/null
  for _ in $(seq 1 60); do
    docker exec pjk-postgres pg_isready -U "$owner" -d "$name" >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec pjk-postgres pg_isready -U "$owner" -d "$name"
  {
    echo "DATABASE_URL=postgres://$owner:$password@localhost:5432/$name"
    echo "APP_DATABASE_URL=postgres://pjk_app_ci:pjk-app-ci@localhost:5432/$name"
  } >>"$GITHUB_ENV"
  exit 0
fi

# The Mac: the runner's own user is a superuser of the local cluster
export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/bin:$PATH"
admin=(psql -d postgres -v ON_ERROR_STOP=1 -qAt)
owner=pjk_ci_owner
db="pjk_ci_${GITHUB_RUN_ID:-local}_${GITHUB_RUN_ATTEMPT:-1}_${GITHUB_JOB:-job}"

case "$action" in
  create)
    "${admin[@]}" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$owner') THEN
    CREATE ROLE $owner LOGIN SUPERUSER PASSWORD '$password';
  END IF;
END
\$\$;
DROP DATABASE IF EXISTS $db WITH (FORCE);
CREATE DATABASE $db OWNER $owner;
SQL
    {
      echo "DATABASE_URL=postgres://$owner:$password@localhost:5432/$db"
      echo "APP_DATABASE_URL=postgres://pjk_app_ci:pjk-app-ci@localhost:5432/$db"
    } >>"$GITHUB_ENV"
    echo "Made $db"
    ;;
  drop)
    "${admin[@]}" -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
    # Anything a cancelled run left behind, a day on
    for old in $("${admin[@]}" -c "SELECT datname FROM pg_database d WHERE datname LIKE 'pjk_ci_%' AND (pg_stat_file('base/' || d.oid || '/PG_VERSION')).modification < now() - interval '1 day'"); do
      "${admin[@]}" -c "DROP DATABASE IF EXISTS $old WITH (FORCE)"
    done
    echo "Dropped $db"
    ;;
  *)
    echo "create or drop" >&2
    exit 1
    ;;
esac
