# ---- build stage -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time base path (e.g. /mvd_aggregator/) — must match Caddy's handle_path
ARG VITE_BASE_PATH=/mvd_aggregator/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY aliases.json ./aliases.json

EXPOSE 3001

CMD ["node", "dist/server/index.js"]
