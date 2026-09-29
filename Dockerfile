# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

WORKDIR /app/service

# Toolchain for better-sqlite3. The package prefers a prebuilt binary
# (`prebuild-install`), and compiles from source only when none matches. Keep
# the toolchain so an arm64 or new-ABI build still succeeds; the prebuilt path
# is what makes the common case fast.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The repository pins dependencies with pnpm-lock.yaml. `npm install` ignores
# it and re-resolves the whole tree on every build, which is the main reason a
# Railway deploy sits in the queue. Copy the lockfile and install from it.
COPY service/package.json service/pnpm-lock.yaml ./

# `--ignore-scripts` is deliberately NOT used: better-sqlite3 needs its
# install script to place the native binding. Layer cache is keyed on the
# manifest and lockfile, so a source-only change reuses this layer.
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-audit --no-fund

COPY service/src ./src
COPY service/db ./db

RUN chown -R node:node /app/service
USER node

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_FILE=./db/laundry.sqlite
# Origin of the browser client, set at deploy time. Defaults to empty: no
# browser origin is allowed until one is named explicitly. Deployed values must
# name the web client origin exactly, with no wildcard.
ENV CORS_ALLOWED_ORIGINS=

EXPOSE 8080

CMD ["node", "src/app.js"]
