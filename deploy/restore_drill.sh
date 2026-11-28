#!/bin/bash
# Proves a dump really restores: loads it into a new, empty database on this
# laptop, times it, and compares every table's row count with the master copy.
# The new database is removed afterwards. Run on the laptop:
#   deploy/restore_drill.sh ~/na3db-server-copies/<date>/na3db.dump
# Options: --env-file FILE (default ../interface/.env), --keep (leave the
# restored database for a look).
set -euo pipefail

ENV_FILE=../interface/.env
KEEP=no
DUMP=
while [ $# -gt 0 ]; do
    case "$1" in
        --env-file) ENV_FILE=$2; shift ;;
        --keep) KEEP=yes ;;
        *) DUMP=$1 ;;
    esac
    shift
done
if [ ! -f "$DUMP" ]; then
    echo "usage: deploy/restore_drill.sh DUMP [--env-file FILE] [--keep]" >&2
    exit 1
fi

set -a; . "$ENV_FILE"; set +a
export PGHOST=$DB_HOST PGPORT=$DB_PORT PGUSER=$DB_USER PGPASSWORD=$DB_PASSWORD
export PGOPTIONS="-c client_min_messages=warning"
MASTER=$DB_NAME
DRILL=na3db_restore_drill

echo "Restoring $DUMP ($(du -h "$DUMP" | cut -f1)) into a new database $DRILL"
TMP=$(mktemp -d)
# Removed at the end, and also when the restore fails half way.
cleanup() {
    rm -rf "$TMP"
    [ "$KEEP" = yes ] || dropdb --if-exists "$DRILL"
}
trap cleanup EXIT

dropdb --if-exists "$DRILL"
createdb "$DRILL"

# --no-owner and --no-acl: the server's accounts do not exist here, and a
# rescue server makes its own (db/web_role.sql).
START=$(date +%s)
pg_restore --no-owner --no-acl --exit-on-error -d "$DRILL" "$DUMP"
SECONDS_TAKEN=$(( $(date +%s) - START ))

COUNT_SQL="select string_agg(format('select %L, count(*) from %I', c.relname, c.relname), ' union all ' order by c.relname)
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'm')"
counts() {
    psql -At -F ' ' -d "$1" -c "$(psql -At -d "$1" -c "$COUNT_SQL")"
}

counts "$DRILL" > "$TMP/restored"
counts "$MASTER" > "$TMP/master"

echo "restored in ${SECONDS_TAKEN}s: $(wc -l < "$TMP/restored") tables, $(awk '{s+=$2} END {print s}' "$TMP/restored") rows"
if diff "$TMP/master" "$TMP/restored" > "$TMP/diff"; then
    echo "SAME AS $MASTER: every table has the same number of rows"
else
    echo "DIFFERENT FROM $MASTER (< $MASTER, > restored):"
    cat "$TMP/diff"
    echo "Fine if the laptop has data not yet shipped to the server; otherwise look closer."
fi

if [ "$KEEP" = yes ]; then
    echo "kept: psql -d $DRILL   (remove with: dropdb $DRILL)"
fi
