# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim
ARG BUN_IMAGE=oven/bun:1.3.10
ARG CODEX_CLI_VERSION=0.114.0
ARG LEAN_LSP_MCP_VERSION=0.24.0
ARG LEAN422_TOOLCHAIN=leanprover/lean4:v4.22.0
ARG LEAN424_TOOLCHAIN=leanprover/lean4:v4.24.0

FROM ${NODE_IMAGE} AS problem9-os-base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    unzip \
    xz-utils \
    zstd \
  && rm -rf /var/lib/apt/lists/*

FROM problem9-os-base AS problem9-toolchain-base

ARG LEAN422_TOOLCHAIN
ARG LEAN424_TOOLCHAIN

ENV ELAN_HOME=/opt/elan
ENV PATH=${ELAN_HOME}/bin:${PATH}

RUN curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf \
  | sh -s -- -y --default-toolchain none \
  && elan toolchain install ${LEAN422_TOOLCHAIN} \
  && elan toolchain install ${LEAN424_TOOLCHAIN}

FROM ${BUN_IMAGE} AS problem9-app-build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json apps/worker/tsconfig.json ./apps/worker/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN bun install --frozen-lockfile

COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared

RUN bun run build:shared \
  && bun run build:worker

FROM problem9-toolchain-base AS problem9-benchmark-base

WORKDIR /app

COPY benchmarks/firstproof/problem9 ./benchmarks/firstproof/problem9

FROM problem9-benchmark-base AS problem9-execution

WORKDIR /app
ENV NODE_ENV=production

COPY --from=problem9-app-build /app/node_modules ./node_modules
COPY --from=problem9-app-build /app/package.json ./package.json
COPY --from=problem9-app-build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=problem9-app-build /app/apps/worker/dist ./apps/worker/dist
COPY --from=problem9-app-build /app/apps/worker/prompts ./apps/worker/prompts
COPY --from=problem9-app-build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=problem9-app-build /app/packages/shared/dist ./packages/shared/dist

CMD ["node", "apps/worker/dist/index.js"]

FROM problem9-execution AS problem9-devbox

ARG CODEX_CLI_VERSION
ARG LEAN_LSP_MCP_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssh-client \
    python3.11 \
    python3.11-venv \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=problem9-app-build /usr/local/bin/bun /usr/local/bin/bun
COPY --from=problem9-app-build /usr/local/bin/bunx /usr/local/bin/bunx
COPY --from=problem9-app-build /usr/local/bun-node-fallback-bin /usr/local/bun-node-fallback-bin

RUN npm install --global @openai/codex@${CODEX_CLI_VERSION} \
  && python3.11 -m venv /opt/lean-lsp-mcp \
  && /opt/lean-lsp-mcp/bin/pip install --no-cache-dir lean-lsp-mcp==${LEAN_LSP_MCP_VERSION} \
  && ln -sf /opt/lean-lsp-mcp/bin/lean-lsp-mcp /usr/local/bin/lean-lsp-mcp

COPY --from=problem9-app-build /app/apps/worker/tsconfig.json ./apps/worker/tsconfig.json
COPY --from=problem9-app-build /app/apps/worker/src ./apps/worker/src

FROM problem9-execution AS paretoproof-worker

CMD ["node", "apps/worker/dist/index.js"]
