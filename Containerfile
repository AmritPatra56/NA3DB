# The NA3DB web app as a container image. Built on the server with
#   podman build -t localhost/na3db_main_app:latest .
# The database is not in here: it runs in its own container, and the
# connection details arrive at run time through --env-file.

# Node 24 is what the tests run on.
FROM docker.io/library/node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so a code-only change reuses this cached layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# The image's own unprivileged user: a break-in gets no root inside.
USER node
EXPOSE 4000

# Plain node, not npm start: the env file is given by podman, not read here.
CMD ["node", "server.js"]
