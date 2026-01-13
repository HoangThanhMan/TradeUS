# # Build stage
# FROM node:20-alpine AS builder

# WORKDIR /app

# # Copy local packages first
# COPY packages/amqp-client ./packages/amqp-client
# COPY packages/shared-types ./packages/shared-types

# # Build shared-types first (it's a dependency of amqp-client)
# WORKDIR /app/packages/shared-types
# RUN npm install && npm run build

# # Build amqp-client
# WORKDIR /app/packages/amqp-client
# RUN npm install && npm run build

# # Back to main app directory
# WORKDIR /app

# # Copy service package files
# COPY apps/ws-gateway/package.json ./
# COPY apps/ws-gateway/tsconfig.json ./
# COPY apps/ws-gateway/tsconfig.build.json ./
# COPY apps/ws-gateway/nest-cli.json ./

# # Update package.json to use local paths
# RUN sed -i 's|"@tradex/amqp-client": "\*"|"@tradex/amqp-client": "file:./packages/amqp-client"|g' package.json && \
#     sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:./packages/shared-types"|g' package.json

# # Install dependencies
# RUN npm install

# # Copy source files
# COPY apps/ws-gateway/src ./src

# # Build
# RUN npm run build

# # Production stage
# FROM node:20-alpine

# WORKDIR /app

# # Copy built files and dependencies
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package.json ./

# # Expose port
# EXPOSE 3001

# # Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# # Start the application
# CMD ["node", "dist/main.js"]

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy file cấu hình gốc
COPY tsconfig.base.json ./

# Copy local packages first
COPY packages/amqp-client ./packages/amqp-client
COPY packages/shared-types ./packages/shared-types

# 1. Build shared-types first
WORKDIR /app/packages/shared-types
RUN npm install && npm run build

# 2. Build amqp-client
WORKDIR /app/packages/amqp-client
# [QUAN TRỌNG] Sửa dependency của amqp-client trỏ về local shared-types
RUN sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:../shared-types"|g' package.json
RUN npm install && npm run build

# 3. Build Main App - Use apps/ws-gateway structure to match tsconfig extends path
WORKDIR /app/apps/ws-gateway

# Copy tsconfig.base.json to correct relative location (../../tsconfig.base.json from apps/ws-gateway)
COPY tsconfig.base.json /app/tsconfig.base.json

# Copy service package files
COPY apps/ws-gateway/package.json ./
COPY apps/ws-gateway/tsconfig.json ./
COPY apps/ws-gateway/tsconfig.build.json ./
COPY apps/ws-gateway/nest-cli.json ./

# Update package.json to use local paths (adjusted for new working directory)
RUN sed -i 's|"@tradex/amqp-client": "\*"|"@tradex/amqp-client": "file:../../packages/amqp-client"|g' package.json && \
    sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:../../packages/shared-types"|g' package.json

# Install dependencies
RUN npm install

# Copy source files
COPY apps/ws-gateway/src ./src

# Build the NestJS app
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy các packages đã build từ builder sang production
COPY --from=builder /app/packages/amqp-client ./packages/amqp-client
COPY --from=builder /app/packages/shared-types ./packages/shared-types

# Copy package files
COPY apps/ws-gateway/package.json ./

# Update package.json again for production
RUN sed -i 's|"@tradex/amqp-client": "\*"|"@tradex/amqp-client": "file:./packages/amqp-client"|g' package.json && \
    sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:./packages/shared-types"|g' package.json

# Install dependencies (only production)
RUN npm install --omit=dev

# Copy built app (note: path changed due to WORKDIR change in builder)
COPY --from=builder /app/apps/ws-gateway/dist ./dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]