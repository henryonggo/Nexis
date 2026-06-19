# Use node slim base image
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# 1. Prune the monorepo to only include the payroll-worker package and its workspace dependencies
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @nexis/payroll-worker --docker

# 2. Install dependencies for the pruned app
FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# 3. Build the worker
COPY --from=builder /app/out/full/ .
RUN pnpm turbo run build --filter=@nexis/payroll-worker...

# 4. Final runner image
FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 express
USER express

COPY --from=installer /app .

EXPOSE 3001
ENV PORT=3001

CMD ["node", "services/payroll-worker/dist/index.js"]
