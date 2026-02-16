FROM oven/bun:latest as builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=builder /app/dist ./dist
COPY server.js .
EXPOSE 8080
CMD ["bun", "run", "start"]
