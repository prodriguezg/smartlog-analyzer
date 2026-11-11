FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false
EXPOSE 3000
CMD ["node", "backend/src/server.js"]

FROM dependencies AS development
RUN chown node:node backend
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/openapi.yaml ./backend/
USER node

FROM dependencies AS runtime
ENV NODE_ENV=production
COPY backend/src ./backend/src
COPY backend/openapi.yaml ./backend/
USER node
