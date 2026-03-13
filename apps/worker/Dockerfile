FROM oven/bun:1.3.10 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json apps/worker/tsconfig.json ./apps/worker/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN bun install --frozen-lockfile

COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared

RUN bun run build:shared
RUN bun run build:worker

FROM node:22-bookworm-slim AS problem9-execution

WORKDIR /app
ENV NODE_ENV=production
ENV PATH=/root/.elan/bin:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils zstd \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none

RUN mkdir -p /run/paretoproof/codex-home /work

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

FROM problem9-execution AS problem9-devbox

ARG CODEX_CLI_VERSION=0.114.0

RUN npm install --global @openai/codex@${CODEX_CLI_VERSION}

FROM problem9-execution AS runtime

CMD ["node", "apps/worker/dist/index.js"]
