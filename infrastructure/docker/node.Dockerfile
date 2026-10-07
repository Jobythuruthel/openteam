# syntax=docker/dockerfile:1.7
# Builds the API, worker and migration images from the monorepo.
# The runtime images carry the full installed workspace. That keeps Prisma's generated client and
# pnpm's symlinked layout intact; slimming the images is tracked as follow-up work.
FROM node:22-alpine AS build
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @openteam/config --filter @openteam/database --filter @openteam/api --filter @openteam/worker run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
ENTRYPOINT ["/sbin/tini", "--"]

FROM runtime AS api
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

FROM runtime AS worker
CMD ["node", "apps/worker/dist/main.js"]

FROM runtime AS migrate
WORKDIR /repo/packages/database
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
