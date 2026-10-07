# syntax=docker/dockerfile:1.7
# Builds the web or CMS app. Pass --build-arg APP=web or APP=cms.
FROM node:22-alpine AS build
ARG APP
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@openteam/${APP}..." run build

FROM node:22-alpine AS runtime
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
ENV APP_DIR=apps/${APP}
USER node
EXPOSE 3000
CMD ["sh", "-c", "node ${APP_DIR}/server.js"]
