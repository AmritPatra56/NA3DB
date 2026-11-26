# The NA3DB web app as a container image. Built on the server with
#   podman build -t localhost/na3db_main_app:latest .
# The database is not in here: it runs in its own container, and the
# connection details arrive at run time through --env-file.

# Node 24 is what the tests run on.
# The React pages, built in a stage of their own: Vite and the other build
# tools stay here, and only the finished client/dist goes on to the image.
FROM docker.io/library/node:24-alpine AS client

WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci && npm cache clean --force
COPY client/ ./
# seqMap.js imports ../../public/cana.js, the one script both sites share.
COPY public/cana.js ../public/
RUN npm run build

FROM docker.io/library/node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so a code-only change reuses this cached layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .
COPY --from=client /build/client/dist ./client/dist
# Pages answer with the React build, not the EJS templates (server.js).
ENV CLIENT_DIR=client/dist

# The image's own unprivileged user: a break-in gets no root inside.
USER node
EXPOSE 4000

# Plain node, not npm start: the env file is given by podman, not read here.
CMD ["node", "server.js"]
