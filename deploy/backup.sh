#!/bin/bash
# A dump of the NA3DB database on the server, keeping the last 7 days.
# Not scheduled: the server's database only changes when we ship new data
# from the laptop, which holds the master copy. Run it by hand on the server
# before changing the data there. The copy that survives a lost server is the
# one deploy/pull_copy.sh brings to the laptop.
set -euo pipefail

DIR=/opt/na3db/main/backups
FILE="$DIR/na3db-$(date +%F).dump"

# Written to a .part file first, so a dump that fails half way never looks
# like a good backup.
podman exec na3db-main-db pg_dump -U na3db -d na3db -Fc > "$FILE.part"
mv "$FILE.part" "$FILE"

find "$DIR" -name 'na3db-*.dump' -mtime +7 -delete
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
