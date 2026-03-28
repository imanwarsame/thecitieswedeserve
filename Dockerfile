FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for all workspaces
COPY package.json ./
COPY src/TCWD.Client/package.json src/TCWD.Client/package-lock.json ./src/TCWD.Client/
COPY server/package.json server/package-lock.json ./server/

# Install all dependencies (including devDependencies)
RUN cd src/TCWD.Client && npm ci
RUN cd server && npm ci

# Copy all source code
COPY src/TCWD.Client/ ./src/TCWD.Client/
COPY server/ ./server/

# Build frontend (skip tsc type-checking, vite handles it)
RUN cd src/TCWD.Client && npx vite build

# Build server
RUN cd server && npx tsc

# Copy frontend build into server dist
RUN mkdir -p server/dist/client && cp -r src/TCWD.Client/dist/* server/dist/client/

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/server/dist ./dist

ENV CLIENT_DIST=/app/dist/client

EXPOSE 3001

CMD ["node", "dist/index.js"]
