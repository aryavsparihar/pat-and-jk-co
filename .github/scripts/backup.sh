#!/usr/bin/env bash
# The nightly database backup (docs/RUNBOOK.md, "Backups"): dump, check, encrypt, upload, prune.
#
#   backup.sh dump <database url> <out file>      pg_dump in custom format, then check it reads back
#   backup.sh encrypt <in file> <out file>        age, to the public key in BACKUP_AGE_RECIPIENT
#   backup.sh upload <file> <yyyy-mm-dd>          to the Drive folder (BACKUP_FOLDER): daily/, and
#                                                 weekly/ on Sundays
#   backup.sh prune                               keeps 14 daily and 8 weekly copies
#
# pg_dump runs in the official postgres image (PG_MAJOR, 18 by default: Neon runs PostgreSQL 18),
# or, where there is no Docker (the self-hosted Mac), the machine's own pg_dump if it is at least
# that version. A pg_dump older than the server refuses to run, and a newer one dumps older
# servers fine, so this must be at least the database's version. Nothing here prints the connection string, and the
# plaintext dump is deleted as soon as it is encrypted.
#
# Google Drive is reached by rclone with the drive.file scope: it can see and touch only the
# files it created itself, nothing else in the account. Its settings come from the environment
# (RCLONE_CONFIG_GDRIVE_*), set by the workflow from repository secrets.
set -euo pipefail

PG_MAJOR=${PG_MAJOR:-18}
FOLDER=${BACKUP_FOLDER:-PJK database backups}
# Nights apart, so a copy made exactly a fortnight (or eight weeks) ago is the oldest one kept
DAILY_MIN_AGE=13d12h
WEEKLY_MIN_AGE=55d12h

# Homebrew's client tools, where they are (the Mac): libpq is not linked onto the PATH
for bin in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
  [ -x "$bin/pg_dump" ] && PATH="$bin:$PATH"
done

native_pg() {
  ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1
}

pg() {
  if native_pg; then
    local major
    major=$(pg_dump --version | sed -E 's/.* ([0-9]+)\..*/\1/')
    if [ "$major" -lt "$PG_MAJOR" ]; then
      echo "This machine's pg_dump is version $major; the database needs $PG_MAJOR or later" >&2
      exit 1
    fi
    "$@"
    return
  fi
  # As the runner's own user, so the files it writes can be shredded afterwards
  docker run --rm --network host --user "$(id -u):$(id -g)" -e PGURL -v "$PWD:/work" -w /work \
    "postgres:${PG_MAJOR}" "$@"
}

case "${1:-}" in
  dump)
    # A connection string pasted into a secret easily picks up a trailing space or line break,
    # which libpq then reads as part of the last setting
    url=$(printf '%s' "$2" | tr -d '[:space:]')
    out=$3
    # Custom format: compressed, and restorable one table at a time
    PGURL=$url pg sh -c 'pg_dump --format=custom --compress=9 --no-password --dbname="$PGURL" --file="$0"' "$out"
    # A dump that cannot be listed back is no backup at all
    PGURL='' pg pg_restore --list "$out" >/dev/null
    echo "Dump written and readable: $(du -h "$out" | cut -f1)"
    ;;
  encrypt)
    in=$2
    out=$3
    if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
      echo "BACKUP_AGE_RECIPIENT is not set" >&2
      exit 1
    fi
    age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$out" "$in"
    shred -u "$in" 2>/dev/null || rm -f "$in"
    echo "Encrypted: $(du -h "$out" | cut -f1)"
    ;;
  upload)
    file=$2
    day=$3
    rclone copyto "$file" "gdrive:$FOLDER/daily/pjk-$day.dump.age" --drive-use-trash=false
    # GNU date (Linux), else BSD date (macOS)
    weekday=$(date -u -d "$day" +%u 2>/dev/null || date -u -j -f %F "$day" +%u)
    if [ "$weekday" = 7 ]; then
      rclone copyto "$file" "gdrive:$FOLDER/weekly/pjk-$day.dump.age" --drive-use-trash=false
    fi
    echo "Uploaded."
    ;;
  prune)
    rclone mkdir "gdrive:$FOLDER/daily"
    rclone mkdir "gdrive:$FOLDER/weekly"
    # Deleted outright, not left in the bin, where they would still count against the quota
    rclone delete "gdrive:$FOLDER/daily" --min-age "$DAILY_MIN_AGE" --drive-use-trash=false
    rclone delete "gdrive:$FOLDER/weekly" --min-age "$WEEKLY_MIN_AGE" --drive-use-trash=false
    echo "Kept: $(rclone lsf "gdrive:$FOLDER/daily" | wc -l) daily, $(rclone lsf "gdrive:$FOLDER/weekly" | wc -l) weekly."
    ;;
  *)
    echo "usage: backup.sh dump|encrypt|upload|prune ..." >&2
    exit 2
    ;;
esac
