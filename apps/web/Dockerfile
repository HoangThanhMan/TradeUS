# =============================================================================
# Next.js frontend
#
# Build từ repo root vì cần cả packages/shared-types và tsconfig.base.json:
#     docker build -f apps/web/Dockerfile -t tradex-web .
# docker-compose.prod.yml đã đặt `context: .` sẵn.
#
# Cách cài dependency theo đúng khuôn của services/user-service/Dockerfile:
# `npm install` từng package + rewrite sang `file:` thay vì dùng npm workspaces.
# Lý do: `npm ci --workspace` đòi package-lock.json khớp với TOÀN BỘ 9 workspace,
# mà image này chỉ copy vào 2 cái.
# =============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# --- packages/shared-types ---------------------------------------------------
# apps/web import UserRole/VipStatus/VipPlan từ đây. Đó là enum — giá trị chạy
# thật, không phải type-only — nên package phải biên dịch ra dist/ TRƯỚC khi
# next build chạy, không thì lỗi "Cannot find module '@tradex/shared-types'".
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
WORKDIR /app/packages/shared-types
RUN npm install && npm run build

# --- apps/web ----------------------------------------------------------------
WORKDIR /app/apps/web
COPY apps/web ./

# Trỏ dependency vào bản vừa build trong image.
RUN sed -i 's|"@tradex/shared-types": "\^1.0.0"|"@tradex/shared-types": "file:../../packages/shared-types"|g' package.json

# --legacy-peer-deps: react 19.2 vs @react-three/fiber ^8 (peer react ^18).
RUN npm install --legacy-peer-deps

# Next 16 build bằng Turbopack, và Turbopack chỉ nạp module nằm TRONG "root" của
# nó. Root được suy ra từ chỗ có lockfile. Thiếu 2 file này ở /app thì root =
# /app/apps/web, mà @tradex/shared-types là symlink trỏ ra /app/packages — tức
# nằm ngoài root — nên next build báo "Module not found: Can't resolve
# '@tradex/shared-types'" DÙ `node -e require.resolve(...)` vẫn ra đúng đường dẫn.
#
# Phải copy SAU `npm install`: nếu có sẵn từ trước, npm nhìn thấy workspace root
# ở /app và cài vào /app/node_modules thay vì /app/apps/web/node_modules.
COPY package.json package-lock.json /app/

# NEXT_PUBLIC_* được nhúng thẳng vào bundle browser lúc build, KHÔNG đọc lúc
# chạy. Thiếu ARG nào thì biến đó rỗng và code rơi về fallback localhost —
# nghĩa là app hỏng trên domain thật mà không báo lỗi gì.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PRICE_WS_URL
ARG NEXT_PUBLIC_ALERT_WS_URL
ARG NEXT_PUBLIC_SENTIMENT_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_PRICE_WS_URL=$NEXT_PUBLIC_PRICE_WS_URL
ENV NEXT_PUBLIC_ALERT_WS_URL=$NEXT_PUBLIC_ALERT_WS_URL
ENV NEXT_PUBLIC_SENTIMENT_WS_URL=$NEXT_PUBLIC_SENTIMENT_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Runtime -----------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Giữ đúng layout /app/packages + /app/apps/web: symlink
# apps/web/node_modules/@tradex/shared-types trỏ ra ../../packages/shared-types,
# đổi đường dẫn là symlink đứt.
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nextjs:nodejs /app/apps/web ./apps/web
# Giữ luôn layout workspace ở runtime để `next start` nhìn thấy cùng một root
# như lúc build.
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./

USER nextjs
WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["/app/apps/web/node_modules/.bin/next", "start", "-p", "3000"]
