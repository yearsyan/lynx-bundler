FROM node:24.11-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client \
 && rm -rf /var/lib/apt/lists/*

COPY main.js /app/main.js
CMD ["node", "main.js"]
