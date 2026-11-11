FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace frontend --include-workspace-root=false
RUN chown node:node frontend
COPY --chown=node:node frontend/src ./frontend/src
COPY --chown=node:node frontend/index.html frontend/vite.config.js ./frontend/

FROM dependencies AS development
RUN install -d -o node -g node frontend/node_modules
USER node
EXPOSE 8080
CMD ["npm", "run", "dev", "--workspace", "frontend"]

FROM dependencies AS build
RUN npm run build --workspace frontend

FROM nginx:1.30-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
