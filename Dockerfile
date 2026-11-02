# Portable production image for Docker hosts (Render, Railway, Fly.io, VPS, etc.).
# Bun installs the committed lockfile; the app itself runs on standard Node.js.
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Keep only runtime dependencies in the final image.
RUN bun install --frozen-lockfile --production

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server.js"]
