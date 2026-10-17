#!/usr/bin/env bash
# Restores one of the nightly backups into a database, and says what it holds (docs/RUNBOOK.md,
# "Restoring from a backup"). Never into production directly: restore into a throwaway Neon
# branch or an empty database, check it, and copy back only what is needed.
#
#   scripts/restore-backup.sh <backup .dump.age> <age key file> <target database url>
#
# The key file is the private key made with age-keygen, kept offline; it never goes anywhere
# else. The decrypted dump exists only in a temporary folder and is deleted at the end.
#
# Needs age and the PostgreSQL 18 client tools, as the backups are made with them: brew install age
# libpq (Homebrew's libpq is used even if an older PostgreSQL is installed too). With PG_DOCKER=1
# the Postgres tools run in the official postgres image instead, as in CI.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: scripts/restore-backup.sh <backup.dump.age> <age key file> <target database url>" >&2
  exit 2
fi
backup=$1
key=$2
target=$(printf '%s' "$3" | tr -d '[:space:]')
# Homebrew's libpq keeps its tools off the PATH; prefer them over an older PostgreSQL's
for dir in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
  [ -x "$dir/pg_restore" ] && PATH="$dir:$PATH"
done
PG_MAJOR=${PG_MAJOR:-18}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

run() {
  if [ "${PG_DOCKER:-}" = 1 ]; then
    docker run --rm --network host --user "$(id -u):$(id -g)" -e PGURL -v "$work:/work" -w /work \
      "postgres:${PG_MAJOR}" "$@"
  else
    (cd "$work" && "$@")
  fi
}

age --decrypt --identity "$key" --output "$work/db.dump" "$backup"
echo "Decrypted. Restoring…"

# One transaction: either everything is restored, or nothing is
PGURL=$target run sh -c 'pg_restore --single-transaction --exit-on-error --no-password --dbname="$PGURL" db.dump'

cat >"$work/check.sql" <<'SQL'
SELECT count(*) || ' tables' FROM pg_tables WHERE schemaname = 'public';
SELECT 'members: ' || count(*) FROM members;
SELECT 'applications: ' || count(*) FROM applications;
SELECT 'artworks: ' || count(*) FROM artworks;
SELECT 'security log entries: ' || count(*) FROM security_events;
SELECT 'newest security log entry: ' || coalesce(max(created_at)::text, 'none') FROM security_events;
SQL
PGURL=$target run sh -c 'psql --no-psqlrc --quiet --tuples-only --no-align --dbname="$PGURL" --file=check.sql'
echo "Restored. Check the figures above against what you expect."
