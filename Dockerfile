FROM oven/bun:latest as builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
RUN bun add express
COPY --from=builder /app/dist ./dist
COPY server.js .
COPY package.json .
EXPOSE 3000
CMD ["bun", "run", "start"]
