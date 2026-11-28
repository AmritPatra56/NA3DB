#!/bin/bash
# Copies what exists only on na3db.org to this laptop, so a lost server can be
# rebuilt: a fresh database dump, the password files, the 3D viewer build and
# the live nginx file. Run it on the laptop, about once a week:
#   deploy/pull_copy.sh
# It only reads on the server. Each run makes one dated folder, readable only
# by you because it holds passwords; the last 4 are kept.
set -euo pipefail

SERVER=${NA3DB_SERVER:-root@na3db.org}
COPIES=${NA3DB_COPIES:-$HOME/na3db-server-copies}
KEEP=4

umask 077
OUT="$COPIES/$(date +%F-%H%M%S)"
mkdir -p "$OUT"

echo "Copying from $SERVER into $OUT"

# A copy that stops half way is removed, so it never looks like a good one
# and never pushes a good one out of the last $KEEP.
trap 'echo "copy failed; nothing kept" >&2; rm -rf "$OUT"' ERR

ssh "$SERVER" podman exec na3db-main-db pg_dump -U na3db -d na3db -Fc > "$OUT/na3db.dump"
[ "$(head -c 5 "$OUT/na3db.dump")" = "PGDMP" ] || false

ssh "$SERVER" tar -C /opt/na3db/main -cf - env app/viewer | tar -C "$OUT" -xf -
mv "$OUT/app/viewer" "$OUT/viewer"
rmdir "$OUT/app"

ssh "$SERVER" cat /etc/nginx/sites-available/na3db.org > "$OUT/na3db.org.nginx"
ssh "$SERVER" git -C /opt/na3db/main/app log -1 --format=%h > "$OUT/server-version.txt"

trap - ERR

# Oldest first; everything but the newest $KEEP goes.
ls -1d "$COPIES"/20*/ | head -n -"$KEEP" | xargs -r rm -rf

echo "copy written:"
du -sh "$OUT"/na3db.dump "$OUT"/env "$OUT"/viewer "$OUT"/na3db.org.nginx
echo "server runs $(cat "$OUT/server-version.txt")"
echo "Check it restores: deploy/restore_drill.sh $OUT/na3db.dump"
