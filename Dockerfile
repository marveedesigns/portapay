FROM node:24.18.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY admin/package.json admin/package.json
RUN npm ci --workspaces --include-workspace-root

FROM node:24.18.0-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/admin/node_modules ./admin/node_modules
COPY . .
RUN npm run build

FROM node:24.18.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/drizzle.config.ts backend/drizzle.config.ts
COPY --from=build /app/backend/src/database backend/src/database
COPY --from=build /app/backend/drizzle backend/drizzle
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/node_modules backend/node_modules
EXPOSE 4000
CMD ["npm", "--workspace", "backend", "run", "start"]