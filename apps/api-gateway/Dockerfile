# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy base tsconfig
COPY tsconfig.base.json ./

# Copy local packages first
COPY packages/shared-types ./packages/shared-types
COPY packages/auth-shared ./packages/auth-shared

# Build shared-types first (dependency for other packages)
WORKDIR /app/packages/shared-types
RUN npm install && npm run build

# Build auth-shared
WORKDIR /app/packages/auth-shared
RUN sed -i 's|"@tradex/shared-types": "\^1.0.0"|"@tradex/shared-types": "file:../shared-types"|g' package.json
RUN npm install --legacy-peer-deps && npm run build

# Back to main app directory - use apps/api-gateway structure to match project path
WORKDIR /app/apps/api-gateway

# Copy tsconfig.base.json to correct relative location
COPY tsconfig.base.json /app/tsconfig.base.json

# Copy service package files
COPY apps/api-gateway/package.json ./
COPY apps/api-gateway/tsconfig.json ./
COPY apps/api-gateway/tsconfig.build.json ./
COPY apps/api-gateway/nest-cli.json ./

# Update package.json to use local paths
RUN sed -i 's|"@tradex/shared-types": "\^1.0.0"|"@tradex/shared-types": "file:../../packages/shared-types"|g' package.json && \
    sed -i 's|"@tradex/auth-shared": "\^1.0.0"|"@tradex/auth-shared": "file:../../packages/auth-shared"|g' package.json

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY apps/api-gateway/src ./src

# Build
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy local packages (already built)
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/packages/auth-shared ./packages/auth-shared

# Copy package files
COPY apps/api-gateway/package.json ./

# Update package.json to use local paths
RUN sed -i 's|"@tradex/shared-types": "\^1.0.0"|"@tradex/shared-types": "file:./packages/shared-types"|g' package.json && \
    sed -i 's|"@tradex/auth-shared": "\^1.0.0"|"@tradex/auth-shared": "file:./packages/auth-shared"|g' package.json

# Install production dependencies only
RUN npm install --omit=dev --legacy-peer-deps

# Copy built files from builder
COPY --from=builder /app/apps/api-gateway/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

CMD ["node", "dist/main.js"]
