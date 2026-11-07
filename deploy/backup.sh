#!/bin/bash
# Nightly dump of the NA3DB database on the server, keeping the last 7 days.
# Run by /etc/cron.d/na3db-main-backup at 03:30.
set -euo pipefail

DIR=/opt/na3db/main/backups
FILE="$DIR/na3db-$(date +%F).dump"

# Written to a .part file first, so a dump that fails half way never looks
# like a good backup.
podman exec na3db-main-db pg_dump -U na3db -d na3db -Fc > "$FILE.part"
mv "$FILE.part" "$FILE"

find "$DIR" -name 'na3db-*.dump' -mtime +7 -delete
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
