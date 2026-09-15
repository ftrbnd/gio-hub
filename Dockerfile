FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json ./admin/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
