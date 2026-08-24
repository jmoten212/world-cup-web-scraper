# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS build
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npx tsc -p tsconfig.server.json

FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM mcr.microsoft.com/playwright:v1.61.1-noble AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json

EXPOSE 3001
CMD ["node", "dist/server.js"]
