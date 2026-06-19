FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
USER cmts

RUN corepack enable
COPY . /app
WORKDIR /app

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --dangerously-allow-all-builds
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm run build
EXPOSE 3000
CMD [ "pnpm", "start" ]
