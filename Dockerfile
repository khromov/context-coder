# Build stage for regular and mini builds
FROM node:22.12-alpine AS builder

# Add build argument to determine build type
ARG BUILD_TYPE=regular

WORKDIR /build

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY instructions.md ./

ENV COCO_BUILD_TYPE=$BUILD_TYPE

RUN npm run build

# Production dependencies stage
FROM node:22.12-alpine AS prod-deps

WORKDIR /deps

COPY package.json package-lock.json ./
RUN npm ci --production --ignore-scripts

# Release stage - same for both regular and mini
FROM node:22-alpine AS release

# Re-declare ARG in this stage so it can be used
ARG BUILD_TYPE=regular
ENV COCO_BUILD_TYPE=$BUILD_TYPE

# Listen on all interfaces inside the container so the published port reaches the server.
# Publish it on 127.0.0.1 only (e.g. "127.0.0.1:3001:3001") to keep it off the network.
ENV COCO_HOST=0.0.0.0

LABEL org.opencontainers.image.title="Context Coder"
LABEL org.opencontainers.image.description="Context Coder: MCP server for full-context coding"
LABEL org.opencontainers.image.vendor="Model Context Protocol"

RUN apk add --no-cache \
    tini \
    less \
    git \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    unzip \
    gnupg \
    github-cli \
    bind-tools \
    jq \
    ncdu

WORKDIR /opt/mcp-server

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package.json ./
COPY --from=builder /build/instructions.md ./
COPY --from=prod-deps /deps/node_modules ./node_modules

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app

# Use exec form to ensure signals are properly handled
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
