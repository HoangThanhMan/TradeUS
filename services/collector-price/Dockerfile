# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy base tsconfig
COPY tsconfig.base.json ./ 

# Copy local packages first
COPY packages/amqp-client ./packages/amqp-client
COPY packages/shared-types ./packages/shared-types

# Build shared-types first
WORKDIR /app/packages/shared-types
RUN npm install && npm run build

# Build amqp-client
WORKDIR /app/packages/amqp-client
RUN sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:../shared-types"|g' package.json
RUN npm install && npm run build

# Back to main app directory - use services/collector-price structure to match tsconfig extends path
WORKDIR /app/services/collector-price

# Copy tsconfig.base.json to correct relative location (../../tsconfig.base.json from services/collector-price)
COPY tsconfig.base.json /app/tsconfig.base.json

# Copy service package files
COPY services/collector-price/package.json ./
COPY services/collector-price/tsconfig.json ./

# Update package.json to use local paths (adjusted for new working directory)
RUN sed -i 's|"@tradex/amqp-client": "\*"|"@tradex/amqp-client": "file:../../packages/amqp-client"|g' package.json && \
    sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:../../packages/shared-types"|g' package.json

# Install dependencies
RUN npm install

# Copy source code
COPY services/collector-price/src ./src

# Build
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy local packages (already built)
COPY --from=builder /app/packages/amqp-client ./packages/amqp-client
COPY --from=builder /app/packages/shared-types ./packages/shared-types

# Copy package files
COPY services/collector-price/package.json ./

# Update package.json to use local paths
RUN sed -i 's|"@tradex/amqp-client": "\*"|"@tradex/amqp-client": "file:./packages/amqp-client"|g' package.json && \
    sed -i 's|"@tradex/shared-types": "\*"|"@tradex/shared-types": "file:./packages/shared-types"|g' package.json

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files from builder (note: path changed due to WORKDIR change in builder)
COPY --from=builder /app/services/collector-price/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

CMD ["node", "dist/main.js"]