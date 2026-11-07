#!/bin/bash
# Ships the latest main to na3db.org. Run on the server:
#   /opt/na3db/main/app/deploy/update.sh
# The database is not touched. If the new version does not answer, the old
# image is still there: see the message at the end.
set -euo pipefail

cd /opt/na3db/main/app
git pull --ff-only origin main

# The running image keeps a second name, so a bad build can be rolled back.
podman tag localhost/na3db_main_app:latest localhost/na3db_main_app:previous
podman build -t localhost/na3db_main_app:latest .

podman rm -f na3db-main-app
podman run -d --name na3db-main-app --pod na3db-main --restart=always \
    --env-file /opt/na3db/main/env/app.env \
    localhost/na3db_main_app:latest

sleep 3
if curl -sf http://127.0.0.1:4100/api/health > /dev/null; then
    echo "updated to $(git log -1 --format='%h %s')"
else
    echo "the new version does not answer. To go back:"
    echo "  podman rm -f na3db-main-app"
    echo "  podman run -d --name na3db-main-app --pod na3db-main --restart=always --env-file /opt/na3db/main/env/app.env localhost/na3db_main_app:previous"
    exit 1
fi
