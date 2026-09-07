# Deploy TradeUS lên server và mở domain

> Toàn bộ stack: 16 service + frontend Next.js = 17 container, chạy bằng Docker
> Compose trên một server Linux, sau đó mở ra domain có HTTPS.

---

## 0. Đọc phần này trước

**Repo ở trạng thái hiện tại chưa deploy ra domain được.** Phần hạ tầng (compose
prod, đóng port, secrets, nginx upstream) đã đúng, nhưng phần frontend + domain
thì chưa bao giờ thông: image `web` sẽ build lỗi, và nếu có build được thì bundle
gửi tới browser người dùng vẫn trỏ về `localhost`.

Tài liệu này chia làm hai phần:

- **PHẦN A** — các file phải sửa trước khi deploy. Không làm A thì B vô nghĩa.
- **PHẦN B** — quy trình deploy trên server.

### Danh sách việc cần làm

**PHẦN A đã được áp dụng hết vào worktree** (chưa commit), và **đã build + chạy
thử cả 17 container trên máy dev**. Bốn mục 14-17 dưới đây là lỗi chỉ lộ ra khi
chạy thật, không thể tìm ra bằng đọc code. Còn lại là việc phải làm trên server —
mục 4, 7, 8, 9 và việc thu hồi app password ở mục 10b.

| # | Việc | File | Mức độ | Trạng thái |
|---|---|---|---|---|
| 1 | Khai báo `@tradex/shared-types` **và `axios`** cho web | `apps/web/package.json`, `package-lock.json` | 🔴 Chặn build | ✅ A1 |
| 2 | Viết lại Dockerfile web (build shared-types, đủ ARG, lockfile cho Turbopack) | `apps/web/Dockerfile` | 🔴 Chặn build | ✅ A2 |
| 3 | Truyền `NEXT_PUBLIC_*` qua `build.args` | `docker-compose.prod.yml` | 🔴 Chặn chạy | ✅ A3.1 |
| 4 | Điền domain thật vào `.env` (có `/api/v1`) | `.env` trên server | 🔴 Chặn chạy | ⬜ B4 |
| 5 | Thay `NEXT_PUBLIC_WS_URL` bằng 3 biến đúng tên | `.env.example` | 🔴 Chặn chạy | ✅ A5 |
| 6 | nginx phục vụ luôn frontend (`location /`) | `infra/nginx/nginx.conf` | 🔴 Chặn domain | ✅ A4 |
| 7 | Trỏ DNS trước khi xin chứng chỉ | — | 🔴 Chặn HTTPS | ⬜ B2 |
| 8 | Cài Caddy đúng cách + Caddyfile một dòng | — | 🔴 Chặn domain | ⬜ B8 |
| 9 | Tạo tài khoản admin | — | 🟠 Chặn tính năng VIP | ⬜ B9 |
| 10 | Gỡ Gmail app password hardcode | `services/email-service/` | 🟠 Bảo mật | ✅ A6 |
| 10c | Loại `src/scripts/**` khỏi build (thiếu `bcrypt`) | `services/user-service/tsconfig.build.json` | 🔴 Chặn build | ✅ A6b |
| 10b | **Thu hồi app password đã bị lộ** | Google Account | 🔴 Bảo mật | ⬜ Bạn phải tự làm |
| 11 | Set `CORS_ORIGINS` cho 3 gateway | `docker-compose.prod.yml` | 🟠 Rủi ro | ✅ A3.3 |
| 12 | Bind port web về `127.0.0.1` | `docker-compose.prod.yml` | 🟠 Bảo mật | ✅ A3.1 |
| 13 | Xoá 1 trong 2 file `next.config.*` | `apps/web/` | 🟡 Dọn dẹp | ✅ A7 |
| 14 | Định tuyến `/api/chatbot` về `web`, không về api-gateway | `infra/nginx/nginx.conf` | 🔴 Chatbot 404 | ✅ A4 |
| 15 | Gỡ `@nestjs` lồng trong `packages/*` (Nest DI vỡ) | `apps/api-gateway/Dockerfile` | 🔴 api-gateway crash-loop | ✅ A8 |
| 16 | Healthcheck nginx dùng `127.0.0.1` thay vì `localhost` | `infra/nginx/Dockerfile`, `docker-compose.dev.yml` | 🟠 Luôn unhealthy | ✅ A9 |
| 17 | torch bản CPU cho prediction-service | `services/prediction-service/Dockerfile` | 🟠 Build timeout | ✅ A10 |
| 18 | 3 tên model Gemini trong repo đều đã bị Google gỡ | `chat-agent-service/`, `sentiment-service/` | 🔴 AI không chạy | ✅ A11 |
| 19 | Sửa endpoint thu thập tin (`/collect/yahoo`) | tài liệu này | 🟠 Lệnh cũ trả 404 | ✅ B10.1 |

### Ba lỗi cũ đã sửa từ trước (giữ lại để bạn biết đang chạy gì)

| Vấn đề | Trạng thái |
|---|---|
| `GEMINI_API_KEY` hardcode trong `sentiment-service/app/config.py` | ✅ Đã gỡ — key cũ bị Google thu hồi vì commit lên repo public |
| `docker-compose.dev.yml` mở 15 service ra `0.0.0.0`, gồm MongoDB/Redis/RabbitMQ/Qdrant không mật khẩu | ✅ `docker-compose.prod.yml` đóng hết |
| nginx trỏ `host.docker.internal` — không resolve trên Linux | ✅ Đã đổi sang tên service compose |

> ⚠️ **Không bao giờ chạy `docker-compose.dev.yml` một mình trên server public.**
> MongoDB và Redis không mật khẩu mở ra internet thường bị quét và xoá sạch dữ
> liệu trong vài giờ. File dev chỉ dành cho máy local.

---

# PHẦN A — Sửa code trước khi deploy

Làm trên máy dev, commit, rồi mới `git pull` trên server.

## A1. `apps/web/package.json` — khai báo 2 dependency bị thiếu

> ✅ **Đã áp dụng vào worktree, và đã build thật thành công.** Toàn bộ A1-A7 đã
> sửa xong; các diff dưới đây là để bạn đọc hiểu *vì sao*, không phải việc còn
> phải làm. Xem `git diff` để đối chiếu, và PHẦN E để biết những gì đã kiểm chứng.

7 file trong `apps/web` import **giá trị** (enum, không phải type-only) từ
`@tradex/shared-types`:

```
app/admin/page.tsx:7            import { UserRole, VipPlan } from '@tradex/shared-types';
app/vip-register/page.tsx:5     import { VipStatus, VipPlan } from '@tradex/shared-types';
app/backtest/page.tsx:15        import { VipStatus } from '@tradex/shared-types';
app/multi-timeframe/page.tsx:13 import { VipStatus } from '@tradex/shared-types';
app/multi-chart/page.tsx:18     import { VipStatus, UserRole } from '@tradex/shared-types';
app/profile/page.tsx:11         import { VipStatus } from '@tradex/shared-types';
src/components/page/Header.tsx:9 import { UserRole } from '@tradex/shared-types';
```

Và 5 file khác `import axios`:

```
src/services/auth.service.ts:1          import axios from 'axios';
src/services/user.service.ts:1          (tương tự)
src/services/prediction.service.ts:1
src/services/sentiment.service.ts:1
src/services/subscription.service.ts:1
```

Nhưng `apps/web/package.json` **không khai báo cái nào trong hai**. Trên máy dev
vẫn chạy vì npm workspaces link `@tradex/shared-types` và hoist `axios` (do
`api-gateway`/`ws-gateway` kéo về) lên `node_modules` gốc. Trong Docker chỉ cài
dependency của riêng `apps/web` nên cả hai biến mất — lần build đầu đứt đúng ở
đây với `Module not found: Can't resolve 'axios'` và
`Can't resolve '@tradex/shared-types'`.

Thêm vào `dependencies` (đúng chuỗi phiên bản `^1.0.0`, vì A2 dùng `sed` khớp nó):

```diff
   "dependencies": {
     "@google/generative-ai": "^0.24.1",
     "@react-three/drei": "^9.92.0",
     "@react-three/fiber": "^8.15.0",
     "@tabler/icons-react": "^3.36.1",
+    "@tradex/shared-types": "^1.0.0",
+    "axios": "^1.7.9",
     "klinecharts": "^9.8.5",
```

`^1.7.9` là để đồng bộ với `api-gateway` và `ws-gateway`; lockfile resolve ra
`axios@1.13.2`.

`package-lock.json` được cập nhật kèm (thêm đúng 2 dòng vào entry `apps/web`).
Entry `node_modules/@tradex/shared-types` (`"link": true`) và `node_modules/axios`
vốn đã có sẵn trong lockfile vì các workspace khác dùng, nên không cần resolve
lại cả cây phụ thuộc. Kiểm tra hai file còn khớp nhau:

```bash
npm ls axios @tradex/shared-types --package-lock-only --workspace apps/web
# +-- @tradex/shared-types@1.0.0 -> ./packages/shared-types
# `-- axios@1.13.2
```

Commit cả `apps/web/package.json` và `package-lock.json`.

> `packages/shared-types` có `main: ./dist/index.js` nhưng `dist/` được
> gitignore. Muốn chạy `npm run dev` ở local thì phải build nó trước:
> `npm run build --workspace @tradex/shared-types`.

## A2. `apps/web/Dockerfile` — viết lại toàn bộ

Bản cũ có 2 lỗi chí tử: không bao giờ copy `packages/` vào image, và chỉ khai báo
2 ARG (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`) trong đó `WS_URL` là biến
không tồn tại trong code.

Thay toàn bộ nội dung file bằng:

```dockerfile
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
```

> Vẫn dùng `next start` chứ không phải `output: standalone` — chuyển sang
> standalone phải sửa `next.config`, không đáng rủi ro ở lần deploy đầu. Đổi lại
> image nặng (~1 GB) vì mang cả `node_modules`.

## A3. `docker-compose.prod.yml` — 4 sửa đổi

> Bốn biến `NEXT_PUBLIC_*` và `CORS_ORIGINS` được viết bằng cú pháp
> `${VAR:?thông báo}` chứ không phải `${VAR}`. Lý do: cả hai nhóm này **rỗng còn
> tệ hơn không có**.
>
> - `NEXT_PUBLIC_*` rỗng → build ra bundle trỏ về `localhost`, deploy xong mới
>   phát hiện, mà lúc đó phải build lại 20 phút.
> - `CORS_ORIGINS` rỗng → code chạy `''.split(',')` ra `['']`, tức là **chặn mọi
>   origin**, tệ hơn cả để mặc định `localhost:3000`.
>
> Với `:?`, compose dừng ngay và in tên biến còn thiếu. Đã thử: bỏ `.env` ra rồi
> chạy `docker compose config` thì báo
> `required variable CORS_ORIGINS is missing a value: set CORS_ORIGINS in .env`.

### A3.1. Service `web`: thêm `build.args`, đóng port

Đây là lỗi làm doc cũ sai ở mục "sửa `.env` rồi `dc build web`": `environment:`
là biến **runtime**, hoàn toàn vô dụng với `NEXT_PUBLIC_*`.

```diff
   web:
     build:
       context: .
       dockerfile: ./apps/web/Dockerfile
+      args:
+        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?set NEXT_PUBLIC_API_URL in .env}
+        NEXT_PUBLIC_PRICE_WS_URL: ${NEXT_PUBLIC_PRICE_WS_URL:?set NEXT_PUBLIC_PRICE_WS_URL in .env}
+        NEXT_PUBLIC_ALERT_WS_URL: ${NEXT_PUBLIC_ALERT_WS_URL:?set NEXT_PUBLIC_ALERT_WS_URL in .env}
+        NEXT_PUBLIC_SENTIMENT_WS_URL: ${NEXT_PUBLIC_SENTIMENT_WS_URL:?set NEXT_PUBLIC_SENTIMENT_WS_URL in .env}
     container_name: tradex-web
     <<: *restart-policy
     logging: *default-logging
     ports:
-      - "3000:3000"
+      # Chỉ localhost: người dùng vào qua nginx :80 → Caddy :443. Mở 0.0.0.0 là
+      # cho phép truy cập http://IP:3000 bỏ qua HTTPS.
+      - "127.0.0.1:3000:3000"
     environment:
       NODE_ENV: production
       PORT: 3000
       # Server-side only: browser không thấy các biến này.
       CHAT_AGENT_SERVICE_URL: http://chat-agent-service:8006
       GEMINI_API_KEY: ${GEMINI_API_KEY:-}
-      # Baked into the client bundle at build time — must be the public URL.
-      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
-      NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL}
     depends_on:
       api-gateway:
         condition: service_started
     networks:
       - tradex-network
```

### A3.2. Service `nginx`: chờ `web` mới khởi động

nginx resolve tên upstream ngay lúc load config. Sau khi A4 thêm `server web:3000`,
nếu container `web` chưa chạy thì nginx chết ngay với `host not found in upstream`.

```diff
   nginx:
     <<: *restart-policy
     logging: *default-logging
     depends_on:
       ws-gateway-1:
         condition: service_healthy
       ws-gateway-2:
         condition: service_healthy
       api-gateway:
         condition: service_started
+      web:
+        condition: service_healthy
```

### A3.3. `CORS_ORIGINS` cho 3 gateway

Hiện không được set ở đâu cả, nên api-gateway rơi về mặc định
`http://localhost:3000` (`apps/api-gateway/src/main.ts:27`) và ws-gateway về
`http://localhost:3000` (`apps/ws-gateway/src/main.ts:14`). Cùng origin qua Caddy
thì tạm sống, nhưng vỡ ngay khi bạn tách `api.ten-mien` hoặc thêm domain `www`.

Thêm dòng `CORS_ORIGINS: ${CORS_ORIGINS}` vào `environment:` của **`api-gateway`,
`ws-gateway-1`, `ws-gateway-2`**:

```diff
   api-gateway:
     environment:
       NODE_ENV: production
       ...
       JWT_REFRESH_EXPIRY: ${JWT_REFRESH_EXPIRY:-7d}
+      CORS_ORIGINS: ${CORS_ORIGINS:?set CORS_ORIGINS in .env}
```

### A3.4. `email-service`: truyền SMTP vào

Hiện chỉ truyền `EMAIL_STRATEGY`. Nghĩa là đặt `EMAIL_STRATEGY=smtp` sẽ dùng
**credential hardcode trong code** (xem A6) chứ không phải của bạn.

```diff
   email-service:
     environment:
       ENVIRONMENT: production
       PORT: 8003
       RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
       EMAIL_STRATEGY: ${EMAIL_STRATEGY:-console}
+      SMTP_HOST: ${SMTP_HOST:-smtp.gmail.com}
+      SMTP_PORT: ${SMTP_PORT:-587}
+      SMTP_USERNAME: ${SMTP_USERNAME:-}
+      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
+      SMTP_FROM_EMAIL: ${SMTP_FROM_EMAIL:-}
+      SMTP_FROM_NAME: ${SMTP_FROM_NAME:-TradeUS}
```

## A4. `infra/nginx/nginx.conf` — cho nginx phục vụ luôn frontend

nginx hiện chỉ có `location /api` và `location /socket.io/`, **không** proxy
frontend. Có 2 cách xử lý; chọn cách này vì Caddy chỉ còn một dòng và port 3000
không cần mở ra ngoài.

Thêm upstream (cạnh `upstream api_gateway`):

```diff
     upstream api_gateway {
         server api-gateway:3001 weight=1;
         keepalive 16;
     }
+
+    upstream web_app {
+        server web:3000;
+        keepalive 16;
+    }
```

Trong block `server`, đổi `server_name` và thêm `location /` vào cuối:

```diff
     server {
         listen 80;
-        server_name localhost;
+        server_name _;
```

```diff
             proxy_buffering off;
         }
+
+        # Frontend Next.js. nginx khớp prefix DÀI NHẤT nên /api và /socket.io/
+        # vẫn thắng, không phụ thuộc thứ tự khai báo.
+        location / {
+            proxy_pass http://web_app;
+            proxy_http_version 1.1;
+
+            proxy_set_header Host $host;
+            proxy_set_header X-Real-IP $remote_addr;
+            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+            proxy_set_header X-Forwarded-Proto $scheme;
+            proxy_set_header Connection "";
+
+            proxy_connect_timeout 60s;
+            proxy_send_timeout 60s;
+            proxy_read_timeout 60s;
+        }
     }
 }
```

### Ngoại lệ: `/api/chatbot` phải về `web`, không về api-gateway

Bẫy này chỉ lộ ra khi chạy thật — chatbot trả **404**.

Next.js có route server-side riêng tại `apps/web/app/api/chatbot/route.ts`, và
`src/components/page/ChatbotPanel.tsx:85` gọi nó bằng URL **tương đối**
`fetch('/api/chatbot')` — tức cùng origin, tức đi qua nginx. Nhưng
`location /api` ở trên đẩy *toàn bộ* `/api*` sang api-gateway, mà api-gateway
không có route đó.

Trên máy dev không ai thấy vì browser gọi thẳng Next ở `:3000`, không qua nginx.

Thêm một `location` riêng — prefix dài hơn nên thắng `location /api`:

```nginx
location /api/chatbot {
    proxy_pass http://web_app;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    # Chatbot gọi LLM + tool, chậm hơn REST thường nhiều.
    proxy_connect_timeout 10s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
}
```

> Nếu sau này bạn thêm route API server-side nào khác trong Next, nhớ thêm
> `location` tương ứng — mặc định mọi thứ dưới `/api` đều về api-gateway.

> ⚠️ `infra/nginx/Dockerfile` **copy `nginx.conf` vào image** (`COPY nginx.conf
> /etc/nginx/nginx.conf`), không mount volume. Sửa file này xong phải
> `dc build nginx && dc up -d nginx`, `dc restart nginx` sẽ không ăn.

## A5. `.env.example` và `.env` — sửa tên và giá trị biến

Hai lỗi ở đây làm app "chạy mà không dùng được".

### Lỗi 1: `NEXT_PUBLIC_API_URL` thiếu `/v1`

api-gateway đặt prefix `api/v1` (`apps/api-gateway/src/main.ts:37`), frontend nối
trực tiếp `${API_URL}/auth/login`. Ghi `/api` là **404 toàn bộ REST, kể cả
login**.

### Lỗi 2: `NEXT_PUBLIC_WS_URL` không tồn tại trong code

Frontend đọc **ba** biến khác, mỗi cái là một namespace socket.io riêng:

| Biến thật | Nơi đọc | Fallback nếu để trống |
|---|---|---|
| `NEXT_PUBLIC_PRICE_WS_URL` | `app/dashboard/page.tsx:27`, `app/multi-chart/page.tsx:20`, `app/backtest/page.tsx:22`, `app/multi-timeframe/page.tsx:16` | `http://localhost/prices` |
| `NEXT_PUBLIC_ALERT_WS_URL` | `src/hooks/useAlertWebSocket.ts:29`, `src/contexts/AlertNotificationContext.tsx:59` | `http://localhost/alerts` |
| `NEXT_PUBLIC_SENTIMENT_WS_URL` | `src/components/page/SentimentPanel.tsx:33` | `http://localhost/sentiment` |

Để sai tên thì giá realtime, thông báo alert và panel sentiment **chết im lặng**
— browser của người dùng đi kết nối `localhost` của chính họ.

Sửa khối `# --- Frontend ---` trong `.env.example`:

```diff
 # --- Frontend ----------------------------------------------------------------
-# Public URL of the API gateway, as reached from the user's browser.
-NEXT_PUBLIC_API_URL=https://your-domain.com/api
-NEXT_PUBLIC_WS_URL=https://your-domain.com
+# Tất cả biến NEXT_PUBLIC_* được nhúng vào bundle lúc BUILD (xem A2/A3.1).
+# Đổi giá trị ở đây phải `dc build web` lại, `dc restart web` không ăn.
+#
+# Phải có /api/v1: api-gateway dùng setGlobalPrefix('api/v1').
+NEXT_PUBLIC_API_URL=https://ten-mien-cua-ban.com/api/v1
+
+# Ba namespace socket.io. Host là domain, path là tên namespace; transport
+# /socket.io/ do nginx proxy.
+NEXT_PUBLIC_PRICE_WS_URL=https://ten-mien-cua-ban.com/prices
+NEXT_PUBLIC_ALERT_WS_URL=https://ten-mien-cua-ban.com/alerts
+NEXT_PUBLIC_SENTIMENT_WS_URL=https://ten-mien-cua-ban.com/sentiment
+
+# --- CORS --------------------------------------------------------------------
+# api-gateway + ws-gateway. Nhiều origin thì phân cách bằng dấu phẩy.
+CORS_ORIGINS=https://ten-mien-cua-ban.com
```

Và khối email:

```diff
 # --- Email -------------------------------------------------------------------
-# console = log emails instead of sending. Change when you wire a real provider.
 EMAIL_STRATEGY=console
+
+# Chỉ cần khi EMAIL_STRATEGY=smtp. Với Gmail phải dùng App Password 16 ký tự
+# (https://myaccount.google.com/apppasswords), không phải mật khẩu tài khoản.
+SMTP_HOST=smtp.gmail.com
+SMTP_PORT=587
+SMTP_USERNAME=
+SMTP_PASSWORD=
+SMTP_FROM_EMAIL=
+SMTP_FROM_NAME=TradeUS
```

## A6. `services/email-service/app/config.py` — gỡ credential hardcode

Đây đúng loại lỗi mà mục 0 nói "đã sửa cho Gemini", nhưng cái này **vẫn còn
trong repo public**:

```python
smtp_username: str = "<gmail-address>"      # dòng 44
smtp_password: str = "<app-password>"         # dòng 45  ← Gmail App Password
email_strategy: Literal["smtp", "console"] = "smtp"   # dòng 50
```

Sửa thành:

```diff
-    smtp_username: str = "<gmail-address>"  # Gmail address
-    smtp_password: str = "<app-password>"  # Gmail App Password (16 chars)
-    smtp_from_email: str = "USTrading"  # Auto-filled from smtp_username if empty
-    smtp_from_name: str = "USTrading"
+    smtp_username: str = ""  # Gmail address — set qua env SMTP_USERNAME
+    smtp_password: str = ""  # Gmail App Password — set qua env SMTP_PASSWORD
+    smtp_from_email: str = ""  # Trống thì lấy theo smtp_username
+    smtp_from_name: str = "TradeUS"
 
     # Email strategy: smtp (Gmail) | console (dev)
-    email_strategy: Literal["smtp", "console"] = "smtp"
+    # Mặc định console: không bao giờ tự gửi mail thật khi thiếu cấu hình.
+    email_strategy: Literal["smtp", "console"] = "console"
```

Đồng thời xoá cặp `SMTP_USERNAME`/`SMTP_PASSWORD` thật trong
`services/email-service/.env.example` (dòng 21-22).

> 🔴 **Sửa code không đủ.** App password đó đã nằm trong git history của một repo
> public, nên nó phải coi như đã bị lộ. Vào
> <https://myaccount.google.com/apppasswords> **thu hồi nó ngay**, rồi tạo cái
> mới và chỉ đặt trong `.env` trên server.

## A6b. `services/user-service/tsconfig.build.json` — loại script dev khỏi build

Lỗi có sẵn trong repo, không liên quan tới việc deploy nhưng **chặn `dc build`**:

```
src/scripts/fix-admin.ts:37:33 - error TS2307:
  Cannot find module 'bcrypt' or its corresponding type declarations.
```

`bcrypt` nằm trong `packages/auth-shared` và `apps/api-gateway`, **không** có
trong `services/user-service/package.json`. Code ứng dụng không sao — nó dùng
`PasswordService` từ `@tradex/auth-shared`. Chỉ mỗi script một lần dùng
`fix-admin.ts` là `import('bcrypt')` trực tiếp.

Đây là **lần thứ ba của cùng một loại lỗi** trong repo này (sau
`@tradex/shared-types` và `axios` ở A1): npm workspaces hoist dependency của
workspace khác lên `node_modules` gốc nên máy dev không thấy gì sai, còn container
chỉ cài dependency của riêng service đó thì thiếu ngay.

Cách sửa: loại `src/scripts/**` khỏi bản build production. Hai script đó
(`seed-admin.ts`, `fix-admin.ts`) vốn **không chạy được trong image prod** — image
cài `--omit=dev` nên không có `ts-node`, và cũng không copy `src/` vào. Không có
code ứng dụng nào import chúng.

```diff
 {
   "extends": "./tsconfig.json",
-  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
+  "exclude": [
+    "node_modules",
+    "test",
+    "dist",
+    "**/*spec.ts",
+    "src/scripts/**"
+  ]
 }
```

> Cách khác là thêm `bcrypt` vào dependency của `user-service`, nhưng `bcrypt` là
> native addon — build trong alpine cần `python3`/`make`/`g++` mà Dockerfile của
> service này không cài. Không đáng đánh đổi để giữ một script dev.

## A7. `apps/web/next.config.js` vs `next.config.ts` — xoá một cái

Đang có cả hai. Next.js chọn `.js` và bỏ qua `.ts`, nên hành vi thực tế đang là
`reactStrictMode: false`, còn `reactCompiler: true` trong `.ts` chưa từng có hiệu
lực.

**Đã xoá `next.config.ts`, giữ `next.config.js`.** Lý do: giữ đúng hành vi mà app
đang chạy — bật react compiler ở lần deploy đầu là đổi cả pipeline build, không
đáng rủi ro.

Muốn ngược lại (giữ `.ts` để bật react compiler) thì file vẫn lấy lại được vì nó
đang được git theo dõi, và `babel-plugin-react-compiler` đã có trong
devDependencies:

```bash
git checkout HEAD -- apps/web/next.config.ts
git rm apps/web/next.config.js
npm run build --workspace web    # thử ở local trước khi deploy
```

## A8. `apps/api-gateway/Dockerfile` — gỡ `@nestjs` lồng trong `packages/*`

Lỗi này chỉ lộ ra khi `dc up`: **api-gateway crash-loop**, log lặp lại:

```
Nest can't resolve dependencies of the RolesGuard (?).
Please make sure that the argument Reflector at index [0] is available
in the ProxyModule module.
```

Nguyên nhân: `packages/auth-shared/package.json` khai báo `@nestjs/common` và
`@nestjs/core` trong **`dependencies`** (đúng ra phải là `peerDependencies` cho
một thư viện dùng chung). npm vì thế cài một bản riêng vào
`packages/auth-shared/node_modules`, và production stage `COPY` nguyên thư mục
đó — kể cả `node_modules` — vào image. Kết quả trong image:

```
/app/node_modules/@nestjs/core                    <- của app
/app/packages/auth-shared/node_modules/@nestjs/core  <- bản lồng
```

`RolesGuard` nằm trong auth-shared nên nhận `Reflector` từ bản lồng, còn Nest của
app cung cấp `Reflector` từ bản kia. Hai class khác nhau ⇒ DI không khớp token.

Sửa trong production stage của Dockerfile, ngay sau khi copy packages:

```dockerfile
RUN rm -rf packages/auth-shared/node_modules/@nestjs \
           packages/shared-types/node_modules/@nestjs
```

Xoá đi thì Node resolve ngược lên `/app/node_modules/@nestjs`, chỉ còn một bản.

> **Ghi chú:** `user-service` có tới **ba** bản `@nestjs/core` (app, auth-shared,
> database) mà vẫn khởi động bình thường — nó đăng ký guard qua `@UseGuards()`
> trên controller chứ không phải làm provider của module, nên đi đường resolve
> khác. Tôi **không** sửa `user-service` vì nó đang chạy tốt và đã test được;
> nhưng đó là quả mìn hẹn giờ. Cách sửa gốc là chuyển `@nestjs/*` sang
> `peerDependencies` trong `packages/auth-shared` — lưu ý riêng việc đó chưa đủ,
> vì Dockerfile vẫn copy cả `node_modules`, nên vẫn cần dòng `rm -rf` trên.

## A9. Healthcheck nginx — `127.0.0.1`, không phải `localhost`

`dc ps` báo `tradex-nginx ... (unhealthy)` trong khi mọi request qua nó đều 200.
Lý do nằm trong log healthcheck:

```
Connecting to localhost ([::1]:80)
wget: can't connect to remote host: Connection refused
```

busybox `wget` resolve `localhost` ra IPv6 `[::1]` trước, mà nginx chỉ có
`listen 80;` (IPv4). Container vì thế bị đánh dấu unhealthy vĩnh viễn dù phục vụ
bình thường — gây hiểu nhầm khi vận hành, và sẽ chặn bất kỳ
`depends_on: nginx: service_healthy` nào thêm sau này.

Sửa ở **cả hai chỗ** (healthcheck trong compose ghi đè cái trong image):

```diff
-  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1
+  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/health || exit 1
```

```diff
     healthcheck:
-      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost/health"]
+      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1/health"]
```

> Chọn `127.0.0.1` chứ không thêm `listen [::]:80;` vào nginx.conf: nếu môi
> trường nào đó tắt IPv6 thì `listen [::]:80` làm nginx **không khởi động được** —
> hỏng nặng hơn nhiều so với một healthcheck sai.

## A10. `services/prediction-service/Dockerfile` — torch bản CPU

`pip install` timeout sau **49 phút** khi build:

```
pip._vendor.urllib3.exceptions.ReadTimeoutError:
  HTTPSConnectionPool(host='files.pythonhosted.org', port=443): Read timed out.
```

`torch>=2.1.0` lấy từ PyPI là bản CUDA — khoảng 2.5 GB kể cả loạt gói `nvidia-*`.
Server đích ở mục B1 không có GPU nên toàn bộ phần đó tải về rồi nằm không.

```diff
-RUN pip install --no-cache-dir -r requirements.txt
+RUN pip install --no-cache-dir --timeout 120 --retries 10 \
+    --index-url https://download.pytorch.org/whl/cpu \
+    "torch>=2.1.0"
+RUN pip install --no-cache-dir --timeout 120 --retries 10 -r requirements.txt
```

Không phải sửa code: `app/ml/model_manager.py:256` đã chọn
`torch.device("cuda" if torch.cuda.is_available() else "cpu")`, nên nó chỉ luôn
rơi vào nhánh `cpu`.

> **Đánh đổi:** nếu sau này chạy `prediction-service` trên máy có GPU thì phải bỏ
> `--index-url` đi để lấy lại bản CUDA.

## A11. Tên model Gemini trong repo đều đã chết

Chỉ lộ ra khi có key thật. Repo hardcode ba tên model, **cả ba đã bị Google gỡ**:

| File | Giá trị cũ | Trạng thái |
|---|---|---|
| `services/chat-agent-service/app/config.py:72` | `gemini-2.0-flash` | ❌ "no longer available" |
| `services/sentiment-service/app/config.py:59` | `gemini-1.5-flash` | ❌ đã gỡ |
| `services/chat-agent-service/app/config.py:55` | `models/embedding-001` | ❌ đã gỡ |

Triệu chứng rất dễ chẩn đoán nhầm: API trả **404** kèm thông báo rõ ràng, nhưng
service bắt exception rồi degrade sang rule-based, nên bề ngoài trông y hệt
"chưa cấu hình API key".

```json
{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer
available. Please update your code to use models/gemini-3.6-flash",
"status":"NOT_FOUND"}}
```

Cách kiểm tra key của bạn còn dùng được model nào:

```bash
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" \
  https://generativelanguage.googleapis.com/v1beta/models \
  | grep -o '"name": "models/[^"]*"'
```

Đã đổi mặc định sang `gemini-3.6-flash` và `models/gemini-embedding-001`, **và
quan trọng hơn là wire ra biến môi trường** — lần sau Google gỡ model thì chỉ sửa
`.env` rồi `dc up -d`, không phải build lại image:

```yaml
# sentiment-service
GEMINI_MODEL: ${GEMINI_MODEL:-gemini-3.6-flash}

# chat-agent-service
GEMINI_MODEL: ${GEMINI_MODEL:-gemini-3.6-flash}
GEMINI_EMBEDDING_MODEL: ${GEMINI_EMBEDDING_MODEL:-models/gemini-embedding-001}
```

> ⚠️ **Đổi model embedding là đổi số chiều vector.** `models/embedding-001` cũ
> trả 768 chiều, `gemini-embedding-001` trả **3072**. Collection Qdrant cũ không
> dùng lại được — `ingest_news` sẽ dừng với thông báo rõ ràng, phải chạy lại với
> `--recreate`.

### Quota free tier rất thấp

Trong lúc test, sau 16 lần phân tích sentiment + 52 lần embedding thì request
chatbot đầu tiên bị chặn:

```
429 You exceeded your current quota
Quota exceeded for metric: generativelanguage.googleapis.com/
generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash
```

Quota tính **theo từng model**, nên đổi `GEMINI_MODEL` sang model khác
(`gemini-2.5-flash`) là dùng tiếp được ngay — thêm một lý do nữa để biến này nằm
ở `.env` chứ không nằm trong code.

Với lưu lượng thật (scheduler chạy 5 phút/lần) thì free tier **không đủ**. Cần
bật billing, hoặc đặt `SENTIMENT_BACKEND=local` để phần sentiment chạy model
cục bộ và chỉ dành quota Gemini cho chatbot.

> Thông báo fallback hiện ghi *"no language model backend is configured"* — sai
> khi nguyên nhân thật là 404 model chết hoặc 429 hết quota. Muốn biết lý do thật
> phải xem `dc logs chat-agent-service`.

---

# PHẦN B — Deploy lên server

## B1. Chọn server — dùng GitHub Student Pack

### Số liệu đo thật, không phải ước lượng

Đo trên stack 17 container đang chạy đầy đủ (`docker stats`), lúc **rảnh**:

| Container | RAM | | Container | RAM |
|---|---:|---|---|---:|
| qdrant | 257 MB | | user-service | 110 MB |
| prediction-service | 217 MB | | symbol-subscription | 71 MB |
| mongodb | 192 MB | | symbol-alert | 52 MB |
| sentiment-service | 152 MB | | email-service | 48 MB |
| rabbitmq | 148 MB | | web | 40 MB |
| chat-agent-service | 114 MB | | ws-gateway ×2 | 77 MB |
| | | | api-gateway + collector + redis + nginx | 83 MB |

**Tổng: 1,56 GB.** Thấp hơn nhiều so với con số "tối thiểu 4 GB" mà bản trước của
tài liệu này ghi.

Dung lượng đĩa: **10,4 GB image** (chưa trừ layer dùng chung, thực tế ~8 GB) +
~1 GB volume. Ngoài ra `dc build` sinh build cache khá lớn — trên máy dev là 21 GB,
dọn bằng `docker builder prune`.

### Nhưng đừng chọn máy 2 GB

Chạy thì 2 GB đủ, **build thì không**. `next build` (Turbopack) và `npm install`
của `apps/web` ngốn hơn hẳn lúc chạy — đó là lý do vẫn nên lấy 4 GB:

| Việc | RAM cần |
|---|---|
| Chạy stack | ~2 GB (1,56 GB + OS) |
| `dc build` (nhất là `web`) | 4 GB trở lên |

Nếu vẫn muốn máy 2 GB: bật swap 4 GB trước khi build, hoặc build ở máy khác rồi
push image lên registry.

### Chọn Oracle Cloud Always Free (ARM Ampere A1)

| | Always Free A1 | Cần thực tế |
|---|---|---|
| CPU | 4 OCPU (ARM) | 2 là đủ |
| RAM | **24 GB** | 1,56 GB chạy / 4 GB build |
| Block storage | 200 GB | ~15 GB |
| Chi phí | **Free vĩnh viễn** | |

Dư thãi so với nhu cầu — và cái dư đó dùng được vào việc thật: 24 GB đủ để chạy
`SENTIMENT_BACKEND=local` và `EMBEDDING_BACKEND=local`, tức **thoát hẳn giới hạn
quota Gemini free tier** đã nói ở A11. Mỗi model transformer tốn ~500 MB RAM.

Cấu hình khi tạo instance:

- Shape: **VM.Standard.A1.Flex**, 2-4 OCPU, 12-24 GB RAM
- Image: **Canonical Ubuntu 24.04** (nhớ chọn bản **aarch64**)
- Boot volume: nâng lên **100 GB** (mặc định 47 GB vẫn đủ nhưng chật khi build)
- Region: gần Việt Nam — Singapore, Osaka hoặc Tokyo
- SSH key: dán public key của bạn vào

### Bốn cái bẫy của Oracle

**1. ARM64, không phải x86.** Toàn bộ 13 image phải build lại cho `aarch64`. Xem
mục A12 — tôi đã test và ghi kết quả ở đó.

**2. "Out of host capacity".** Đây là vấn đề kinh điển của Oracle: shape A1 miễn
phí thường hết chỗ ở các region phổ biến. Cách xử lý: đổi availability domain,
đổi region, hoặc thử lại vào giờ thấp điểm. Có thể mất vài ngày mới tạo được.

**3. iptables chặn sẵn.** Ảnh Ubuntu của Oracle có sẵn luật iptables rất chặt,
**mở port trong VCN Security List là chưa đủ** — traffic vẫn bị drop ở trong máy.
Xem B5, phải làm cả hai chỗ.

**4. IP mặc định là ephemeral.** Nó đổi khi bạn stop/start instance, làm chết bản
ghi DNS ở B2. Vào *Instance → Attached VNICs → IPv4 Addresses → Edit* và đổi
public IP sang **Reserved** trước khi trỏ DNS.

> Oracle yêu cầu thẻ tín dụng để xác minh (không trừ tiền), và có chính sách thu
> hồi tài nguyên Always Free để không (idle). Đây là stack chạy liên tục nên
> không dính, nhưng đừng để instance tắt lâu.

### Nếu không tạo được A1 vì hết chỗ

Bạn vẫn còn credit DigitalOcean $200 trong Student Pack làm phương án dự phòng:
droplet **s-2vcpu-4gb** (4 GB / 2 vCPU / 80 GB, $24/th) dùng được ~8 tháng, chạy
x86 nên **không phải lo chuyện ARM**, và toàn bộ image đã được test trên x86 rồi.

### Việc bạn phải tự làm (tôi không làm thay được)

1. Tạo tài khoản Oracle Cloud, xác minh thẻ
2. Tạo instance A1 Ubuntu 24.04 aarch64 theo cấu hình trên
3. Đổi public IP sang Reserved, ghi lại IP
4. Domain: kích hoạt <https://education.github.com/pack> để lấy `.me` free 1 năm
   ở Namecheap (phần này của Student Pack vẫn dùng được dù server ở Oracle)

Có IP rồi thì sang B2.

**Cần Docker Compose v2.24+** (file prod dùng cú pháp `!override`) — script cài ở
B3 luôn cho bản mới, nhưng nhớ kiểm tra:

```bash
docker compose version   # phải >= v2.24
```

## B2. Trỏ DNS trước — làm đầu tiên

Let's Encrypt xác thực bằng cách gọi vào domain của bạn, nên DNS phải sống
**trước** khi chạy Caddy, không thì xin chứng chỉ fail. Đây là lý do B2 đứng
trước B3-B8 chứ không phải làm cuối.

> ⚠️ **Với Oracle: đổi public IP sang Reserved trước khi làm bước này.** IP
> ephemeral mặc định sẽ đổi khi stop/start instance, và lúc đó bản ghi A bên dưới
> trỏ vào hư không — chứng chỉ HTTPS cũng chết theo.

### Với domain `.me` từ Namecheap (Student Pack)

Cách gọn nhất là để nguyên DNS ở Namecheap, chỉ thêm 2 bản ghi A. Ít thứ phải
đụng hơn so với chuyển nameserver sang DigitalOcean.

Namecheap → **Domain List** → `Manage` → tab **Advanced DNS** → *Host Records*:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | IP droplet | Automatic |
| A Record | `www` | IP droplet | Automatic |

Xoá các bản ghi mặc định `CNAME www → parkingpage...` và `URL Redirect` nếu có —
để lại là nó đè lên bản ghi mới.

### Kiểm tra trước khi đi tiếp

Trên Linux/macOS:

```bash
dig +short ten-mien-cua-ban.me A
dig +short www.ten-mien-cua-ban.me A
```

Trên Windows (PowerShell):

```powershell
Resolve-DnsName ten-mien-cua-ban.me -Type A
```

Cả hai phải trả về **đúng IP droplet**. Chưa ra thì đợi — Namecheap thường vài
phút tới 30 phút, có thể lâu hơn nếu domain vừa đăng ký.

> ⚠️ **Đừng chạy B8 (Caddy) khi lệnh trên chưa đúng.** Let's Encrypt có giới hạn
> số lần thất bại; xin cert khi DNS chưa trỏ sẽ đốt hạn mức và bạn phải chờ hàng
> giờ mới thử lại được.

Kiểm tra thêm rằng cổng 80 đã tới được droplet (sau khi làm B5):

```bash
curl -sI http://ten-mien-cua-ban.me | head -1
```

## B2. Trỏ DNS trước — làm đầu tiên

Let's Encrypt xác thực bằng cách gọi vào domain của bạn, nên DNS phải sống
**trước** khi chạy Caddy, không thì xin chứng chỉ fail.

Ở trang quản lý domain, tạo:

| Type | Name | Value |
|---|---|---|
| A | `@` | IP public của server |
| A (hoặc CNAME) | `www` | IP server (hoặc `ten-mien-cua-ban.com`) |

Kiểm tra từ máy bạn, phải ra đúng IP server:

```bash
dig +short ten-mien-cua-ban.com A
```

Chưa ra thì đợi TTL (thường 5-30 phút). Đừng làm B8 trước khi lệnh này đúng.

## B3. Cài Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker            # hoặc logout/login lại
```

## B4. Clone và tạo `.env`

```bash
git clone https://github.com/HoangThanhMan/TradeUS.git
cd TradeUS
cp .env.example .env
chmod 600 .env
```

Sinh mật khẩu ngẫu nhiên:

```bash
for k in MONGO_ROOT_PASSWORD RABBITMQ_PASSWORD REDIS_PASSWORD JWT_SECRET; do
  echo "$k=$(openssl rand -base64 36 | tr -d '/+=' | head -c 40)"
done
```

Dán vào `.env`, rồi điền nốt — thay `ten-mien-cua-ban.com` bằng domain thật:

```bash
GEMINI_API_KEY=AIza...                    # https://aistudio.google.com/apikey

NEXT_PUBLIC_API_URL=https://ten-mien-cua-ban.com/api/v1
NEXT_PUBLIC_PRICE_WS_URL=https://ten-mien-cua-ban.com/prices
NEXT_PUBLIC_ALERT_WS_URL=https://ten-mien-cua-ban.com/alerts
NEXT_PUBLIC_SENTIMENT_WS_URL=https://ten-mien-cua-ban.com/sentiment
CORS_ORIGINS=https://ten-mien-cua-ban.com
```

> `GEMINI_API_KEY` để trống vẫn chạy: `sentiment-service` chuyển sang heuristic
> từ khoá, `chat-agent-service` chuyển sang planner rule-based. Cả hai báo rõ
> trong `/health`, không âm thầm giả vờ là AI.

Nạp `.env` vào shell để các lệnh `mongosh` ở dưới dùng được:

```bash
set -a; source .env; set +a
```

## B5. Firewall — với Oracle phải làm ở **hai** chỗ

Đây là chỗ tốn thời gian nhất của người mới dùng Oracle: mở port trên giao diện
web rồi mà vẫn không vào được, vì trong máy còn một tầng chặn nữa.

### 5a. VCN Security List (tầng ngoài, trên giao diện Oracle)

*Networking → Virtual Cloud Networks → VCN của bạn → Security Lists → Default*
→ **Add Ingress Rules**:

| Source CIDR | Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

(Cổng 22 đã có sẵn.)

### 5b. iptables trong máy (tầng trong — chỗ hay bị quên)

Ảnh Ubuntu của Oracle cài sẵn luật iptables chặn hầu hết cổng, **độc lập với
Security List**. Không sửa thì `curl` từ ngoài vẫn treo dù đã mở ở 5a.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save     # giữ luật sau khi reboot
```

Kiểm tra luật đã vào đúng chỗ:

```bash
sudo iptables -L INPUT -n --line-numbers | head -12
```

> Nếu dùng DigitalOcean thay vì Oracle thì bỏ qua cả 5a lẫn 5b, chỉ cần `ufw`:
> ```bash
> sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
> sudo ufw --force enable
> ```

### Kiểm tra từ máy bạn

```bash
curl -sI --max-time 10 http://<IP-SERVER> | head -1
```

Treo hoặc timeout = còn một tầng chặn chưa mở. Ra `HTTP/1.1 ...` bất kỳ (kể cả
502) = đã thông.

Port `3000` không cần mở ở đâu cả: sau A3.1 nó chỉ bind `127.0.0.1`, người dùng
đi qua Caddy → nginx.

## B6. Kiểm tra cấu hình trước khi chạy

```bash
alias dc='docker compose -f docker-compose.dev.yml -f docker-compose.prod.yml'
dc config | grep -A3 "published"
```

Chỉ được thấy hai mục: `80` (nginx) và `3000` với `host_ip: 127.0.0.1` (web).
Nếu thấy `27017`, `6379`, `5672`, `6333` là file prod chưa được áp dụng — kiểm
tra lại thứ tự `-f`.

Kiểm tra luôn `build.args` đã có domain thật (không rỗng):

```bash
dc config | grep -A6 "NEXT_PUBLIC"
```

> Nếu `dc config` báo `required variable ... is missing a value` thì đó là guard
> `:?` ở A3 đang chặn — bạn chưa điền biến đó vào `.env`. Đây là lý do B4 phải
> làm trước B6, và cũng là lý do mọi lệnh `dc ...` (kể cả `dc down`) đều cần
> `.env` tồn tại.

## B7. Build và chạy

```bash
dc build          # lần đầu ~15-25 phút
dc up -d
dc ps
```

Chờ 1-2 phút cho healthcheck chuyển `healthy` — nhiều service có
`depends_on: service_healthy` nên chúng lên theo thứ tự chứ không đồng loạt.

```bash
watch -n2 'dc ps --format "table {{.Name}}\t{{.Status}}"'
```

### Kiểm tra nội bộ

```bash
curl localhost/health          # nginx → healthy
curl -I localhost/             # nginx → web, phải ra 200 và header x-powered-by: Next.js
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost/api/v1/auth/login   # 400/401 = routing đúng; 404 = sai
```

Các service nội bộ không mở port, phải gọi qua `dc exec`:

```bash
dc exec sentiment-service  python -c "import httpx;print(httpx.get('http://localhost:8001/health').text)"
dc exec prediction-service python -c "import httpx;print(httpx.get('http://localhost:8002/health').text)"
dc exec chat-agent-service python -c "import httpx;print(httpx.get('http://localhost:8006/health').text)"
```

### Xác nhận domain đã được nhúng vào bundle

Bước này bắt đúng lỗi mà doc cũ bỏ sót. Phải thấy domain của bạn, và **không**
thấy `localhost`:

```bash
dc exec web sh -c "grep -rlo 'ten-mien-cua-ban.com' .next/static | head -3"
dc exec web sh -c "grep -rlo 'localhost:3001'      .next/static | head -3"   # phải rỗng
```

Nếu lệnh thứ hai có kết quả: `build.args` chưa tới được Dockerfile → xem lại
A3.1, rồi `dc build --no-cache web && dc up -d web`.

## B8. Caddy + HTTPS

nginx trong stack chỉ nghe HTTP `:80`. Caddy đứng trước để tự xin và gia hạn
chứng chỉ Let's Encrypt.

### Cài Caddy

`sudo apt install caddy` **không chạy được** trên Ubuntu mặc định — Caddy không
có trong repo chính. Phải thêm repo của họ:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### `/etc/caddy/Caddyfile`

Sau A4, nginx đã phục vụ cả frontend + API + WebSocket, nên Caddyfile chỉ còn một
dòng proxy:

```
ten-mien-cua-ban.com, www.ten-mien-cua-ban.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:80
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager     # xem đã lấy được cert chưa
```

> ⚠️ **Đừng viết Caddyfile theo kiểu này** (bản cũ của tài liệu này sai đúng chỗ
> đó):
>
> ```
> reverse_proxy localhost:3000            # không matcher → khớp MỌI request
> reverse_proxy /api/*       localhost:80
> reverse_proxy /socket.io/* localhost:80
> ```
>
> Caddy không sắp xếp các directive cùng loại theo độ cụ thể của path như nginx.
> Dòng catch-all ở trên rất dễ ăn hết `/api/*`. Nếu bắt buộc phải chia route
> trong Caddy thì dùng block `handle`, đừng dùng nhiều `reverse_proxy` lẫn nhau:
>
> ```
> ten-mien-cua-ban.com {
>     handle /api/*       { reverse_proxy 127.0.0.1:80 }
>     handle /socket.io/* { reverse_proxy 127.0.0.1:80 }
>     handle              { reverse_proxy 127.0.0.1:3000 }
> }
> ```

### Đổi domain sau này

`NEXT_PUBLIC_*` nằm trong bundle, nên đổi domain là phải **build lại**, không chỉ
restart:

```bash
# sửa .env
dc build web && dc up -d web
```

## B9. Tạo tài khoản admin

Đăng ký thường luôn ra `role: user` (`services/user-service/src/users/users.service.ts:60`
hardcode, không nhận `role` từ request — tốt, không leo thang quyền được). Nhưng
luồng VIP cần admin duyệt (`services/user-service/src/admin/admin.controller.ts:25`),
nên **không có admin thì không ai được lên VIP**.

> Đừng dùng `npm run seed:admin`: `services/user-service/Dockerfile` cài
> `--omit=dev` và chỉ copy `dist`, nên image prod **không có `ts-node` lẫn
> `src/`**. Script đó cũng hardcode `admin@ustrading.com / Admin@123456` — không
> nên dùng trên máy công khai.

Cách làm: đăng ký như người dùng thường, rồi nâng quyền trong Mongo.

```bash
# 1. Đăng ký. password >= 8 ký tự; username 3-30 ký tự [a-zA-Z0-9_-].
curl -s -X POST https://ten-mien-cua-ban.com/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ten-mien-cua-ban.com",
       "password":"DAT_MAT_KHAU_MANH_O_DAY",
       "username":"admin",
       "name":"Administrator"}'

# 2. Nâng lên admin. DB là `tradex-users` (có gạch ngang), collection `users`.
dc exec -T mongodb mongosh -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --quiet --eval '
  db.getSiblingDB("tradex-users").users.updateOne(
    { email: "admin@ten-mien-cua-ban.com" },
    { $set: { role: "admin" } })'

# 3. Xác nhận
dc exec -T mongodb mongosh -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --quiet --eval '
  db.getSiblingDB("tradex-users").users.find(
    { role: "admin" }, { email: 1, role: 1 }).toArray()'
```

Đăng nhập lại sau bước 2 để token mang role mới (access token cũ vẫn ghi
`role: user` cho tới khi hết hạn — mặc định 15 phút).

Giá trị role hợp lệ: `user`, `vip`, `admin` (`packages/shared-types/src/types/user.types.ts:1-5`).

## B10. Nạp dữ liệu

Stack chạy được ngay nhưng **chưa có dữ liệu**. Ba bước sau mới làm nó hữu ích.

### B10.1. Thu thập tin tức

`sentiment-service` có scheduler tự chạy mỗi 5 phút (`ENABLE_SCHEDULER=true`).
Muốn có ngay:

```bash
dc exec sentiment-service python -c "
import httpx
print(httpx.post('http://localhost:8001/collect/yahoo',
                 json={'analyze_immediately': True}, timeout=600).text)"
```

> Đường dẫn là `/collect/yahoo`. Bản trước của tài liệu ghi
> `/collectors/yahoo/collect` — **sai, trả 404**. Route thật khai báo ở
> `app/routes/collector_routes.py:19` với `prefix="/collect"`.

Kết quả mẫu:

```json
{"source":"yahoo","collected_count":50,"new_count":50,
 "analyzed_count":50,"errors":[],"duration_seconds":42.1}
```

`new_count: 0` nghĩa là các bài đó đã có trong DB từ trước, không phải lỗi. Nếu
`analyzed_count` thấp hơn `new_count`, chạy tiếp phần còn lại:

```bash
dc exec sentiment-service python -c "
import httpx;print(httpx.post('http://localhost:8001/collect/analyze-pending',
                              timeout=600).text)"
```

Kiểm tra bài nào được phân tích bằng LLM thật, bài nào bằng heuristic từ khoá:

```bash
dc exec -T mongodb mongosh -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --quiet --eval '
  db.getSiblingDB("tradex_sentiment").sentiments.aggregate([
    { $group: { _id: "$backend", n: { $sum: 1 } } }
  ]).forEach(r => print(r._id + ": " + r.n))'
```

`backend: gemini` là LLM thật; `backend: mock` là heuristic từ khoá vì thiếu key,
hết quota, hoặc model đã bị gỡ (A11).

Đếm số bài đã có:

```bash
dc exec -T mongodb mongosh -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --quiet \
  --eval 'db.getSiblingDB("tradex_sentiment").collected_news.countDocuments()'
```

### B10.2. Xây index tìm kiếm cho chatbot

Chatbot chỉ trích dẫn được tin thật sau khi Qdrant có dữ liệu:

```bash
dc exec chat-agent-service python -m scripts.ingest_news
```

Kết quả thật khi chạy thử (52 bài đã thu được ở B10.1):

```
Collection : news_chunks
Embedder   : gemini:models/gemini-embedding-001 (3072-dim)
Articles   : 52 loaded, 52 embedded, 0 skipped
Points     : 52 in collection
Symbols    : {'BTCUSDT': 19, 'BNBUSDT': 10, 'ETHUSDT': 9, 'XRPUSDT': 8, 'SOLUSDT': 6}
```

Dòng `Embedder` là chỗ đáng nhìn nhất: nó cho biết đang embed bằng Gemini hay
model cục bộ, và số chiều đang dùng. Nếu số chiều khác với collection đã có,
script dừng luôn kèm hướng dẫn `--recreate` chứ không trộn lẫn vector.

Thử tìm:

```bash
dc exec chat-agent-service python -m scripts.search_news "ETF inflows" -k 3
```

Chạy lại lúc nào cũng được — bài không đổi sẽ bị bỏ qua (`0 embedded, 227
skipped`). Đặt cron mỗi giờ:

```cron
0 * * * * cd /path/TradeUS && docker compose -f docker-compose.dev.yml -f docker-compose.prod.yml exec -T chat-agent-service python -m scripts.ingest_news >> /var/log/tradeus-ingest.log 2>&1
```

### B10.3. Buffer giá — đầy ngay, không phải đợi

> **Sửa lại thông tin cũ.** Bản trước của tài liệu này nói buffer khung `1h` phải
> mất ~50 giờ mới đầy. **Sai.** Đo thực tế sau ~10 phút chạy: cả 5 symbol, cả 10
> khung từ `1s` tới `1w` đều `size: 100 / required: 50, ready: true`.
>
> Lý do: `collector-price` không chỉ stream WebSocket, nó còn gọi REST
> `/fapi/v1/klines` của Binance để backfill lịch sử lúc khởi động
> (`src/binance/client.ts:51`). Nên `get_prediction` dùng được gần như ngay.

Kiểm tra:

```bash
dc exec prediction-service python -c "
import httpx;print(httpx.get('http://localhost:8002/predictions/buffer-status').text)"
```

Kết quả mong đợi — `model_loaded: true` và `ready: true` ở các khung bạn quan tâm.
Nếu thấy `"Need 24 candles, have 0"` thì buffer thật sự rỗng: xem
`dc logs collector-price`, thường là mất kết nối Binance hoặc RabbitMQ.

```bash
dc exec prediction-service python -c "
import httpx;print(httpx.get('http://localhost:8002/predictions/buffer-status').text)"
```

## B11. Checklist nghiệm thu

Chạy từ **máy bạn**, không phải trên server:

```bash
# 1. HTTPS + frontend
curl -sI https://ten-mien-cua-ban.com | head -3          # 200, có x-powered-by: Next.js

# 2. Chứng chỉ hợp lệ
curl -sI https://ten-mien-cua-ban.com >/dev/null && echo "TLS OK"

# 3. REST đi tới api-gateway (400/401 = OK, 404 = sai path/prefix)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ten-mien-cua-ban.com/api/v1/auth/login

# 4. Socket.IO handshake — phải trả về chuỗi bắt đầu bằng 0{"sid":
curl -s "https://ten-mien-cua-ban.com/socket.io/?EIO=4&transport=polling" | head -c 80
```

Rồi mở domain trên browser, bật DevTools:

- [ ] Tab Network: **không có** request nào tới `localhost` — có là do bundle
      build sai (xem B7).
- [ ] Dashboard hiện giá nhảy realtime (socket `/prices` connected).
- [ ] Đăng ký / đăng nhập được.
- [ ] Vào bằng tài khoản admin thấy trang `/admin`.
- [ ] Chatbot trả lời có trích dẫn tin (nếu đã chạy B10.2).
- [ ] Console không có lỗi CORS.

---

# PHẦN C — Vận hành

```bash
dc logs -f --tail=100 chat-agent-service   # log 1 service
dc logs -f                                 # tất cả
dc restart sentiment-service
dc down                                    # dừng, giữ dữ liệu
dc down -v                                 # ⚠️ xoá volume = mất sạch DB
```

### Cập nhật code

```bash
git pull
dc build
dc up -d
```

Nhớ: sửa `nginx.conf` → `dc build nginx`. Sửa `.env` phần `NEXT_PUBLIC_*` →
`dc build web`.

### Backup MongoDB

```bash
dc exec -T mongodb mongodump -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --archive \
  | gzip > backup-$(date +%F).gz
```

Cron hằng ngày, giữ 7 bản:

```cron
30 3 * * * cd /path/TradeUS && set -a && . ./.env && set +a && docker compose -f docker-compose.dev.yml -f docker-compose.prod.yml exec -T mongodb mongodump -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --archive | gzip > /var/backups/tradeus-$(date +\%F).gz && find /var/backups -name 'tradeus-*.gz' -mtime +7 -delete
```

Qdrant dựng lại được từ MongoDB bằng `ingest_news.py` nên không cần backup riêng.

### Truy cập DB để debug

Không mở port ra internet. Dùng SSH tunnel:

```bash
# Trên máy bạn
ssh -L 27017:localhost:27017 user@server
```

Kèm theo tạm thêm `ports: ["127.0.0.1:27017:27017"]` vào `mongodb` trong
`docker-compose.prod.yml`, rồi `dc up -d mongodb`. Gỡ ra sau khi xong.

---

# PHẦN D — Lỗi thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| `dc build` báo `!override` không hợp lệ | Docker Compose < v2.24. Nâng cấp Docker. |
| Build `web` lỗi `Module not found: Can't resolve 'axios'` | `axios` chưa được khai báo trong `apps/web/package.json` (A1). Máy dev che lỗi này vì npm hoist axios từ workspace khác. |
| Build `web` lỗi `Module not found: Can't resolve '@tradex/shared-types'` | Nếu `node -e "require.resolve('@tradex/shared-types')"` trong container vẫn ra đúng đường dẫn thì đây **không phải** lỗi npm mà là Turbopack không thấy module ngoài root — thiếu `COPY package.json package-lock.json /app/` (A2). Nếu resolve cũng fail thì là `sed` không khớp chuỗi `^1.0.0`. |
| `npm install` của `apps/web` cài vào `/app/node_modules` thay vì `/app/apps/web/node_modules` | Lockfile gốc bị copy vào `/app` **trước** `npm install`, npm coi đó là workspace root. Phải copy sau (A2). |
| Build `web` lỗi `ERESOLVE` peer deps | Thiếu `--legacy-peer-deps` trong A2. |
| Frontend load được nhưng login trả 404 | `NEXT_PUBLIC_API_URL` thiếu `/v1` (A5). |
| Giá không nhảy, DevTools thấy request tới `localhost/prices` | Dùng sai tên biến WS (A5), hoặc `build.args` chưa truyền (A3.1). |
| DevTools báo lỗi CORS | `CORS_ORIGINS` chưa set hoặc không khớp domain kể cả `www` (A3.3). |
| nginx chết ngay, log `host not found in upstream "web"` | Container `web` chưa chạy — thiếu `depends_on: web` (A3.2). |
| Sửa `nginx.conf` mà không thấy hiệu lực | Config bake trong image. Phải `dc build nginx`. |
| Caddy không lấy được cert | DNS chưa trỏ đúng (B2), hoặc port 80 bị firewall chặn (B5). |
| Vào domain ra trang nginx/404 thay vì app | Chưa thêm `location /` (A4). |
| Service `unhealthy`, log `Authentication failed` | Đổi mật khẩu trong `.env` nhưng volume Mongo cũ giữ user cũ. `dc down -v` (mất dữ liệu) hoặc tạo user bằng tay. |
| Chatbot trả lời nhưng không trích dẫn tin | Chưa chạy `ingest_news` (B10.2). |
| Chatbot kèm "Generated without an LLM" | `GEMINI_API_KEY` trống/sai → planner rule-based. Xem `/health`. |
| `get_prediction` luôn báo `Need 24 candles` | Buffer chưa đầy (B10.3), hoặc `collector-price` chết — `dc logs collector-price`. |
| Không ai lên được VIP | Chưa có tài khoản admin để duyệt (B9). |
| `dc up` dừng với `dependency failed to start: container tradex-rabbitmq is unhealthy` | Lần khởi tạo volume đầu tiên RabbitMQ có thể chết với `Error when reading /var/lib/rabbitmq/.erlang.cookie: eacces`. **Chạy lại `dc up -d` là qua** — lần thứ hai nó khởi động bình thường. Gặp trên Docker Desktop/Windows. |
| `api-gateway` restart liên tục, log `Nest can't resolve dependencies of the RolesGuard` | Có 2 bản `@nestjs/core` trong image (A8). Kiểm tra: `docker run --rm --entrypoint sh <image> -c 'find /app -maxdepth 6 -type d -path "*@nestjs/core"'` — chỉ được ra 1 dòng. |
| `dc ps` báo nginx `unhealthy` nhưng mọi request đều 200 | Healthcheck gọi `localhost` → IPv6 `[::1]`, nginx chỉ listen IPv4 (A9). |
| Chatbot trả 404 | `/api/chatbot` là route của Next, không phải api-gateway. Thiếu `location /api/chatbot` trong nginx (A4). |
| Chatbot trả lời kèm `News search unavailable: No module named 'torch'` | Không có `GEMINI_API_KEY` nên phần tìm tin rơi sang embedding local, mà image không cài torch. Đặt `GEMINI_API_KEY`, hoặc build image với `requirements-local.txt` và `EMBEDDING_BACKEND=local`. |
| Đã có `GEMINI_API_KEY` mà vẫn `Generated without an LLM`, `/health` lại báo `effective: gemini` | Thông báo đó **nói sai nguyên nhân**. Xem `dc logs chat-agent-service`: thường là `404` model đã bị gỡ (A11) hoặc `429` hết quota free tier. |
| `429 ... generate_content_free_tier_requests, limit: 20` | Hết quota free tier của model đó. Quota tính theo từng model — đổi `GEMINI_MODEL` trong `.env` rồi `dc up -d` là dùng tiếp được. Lưu lượng thật thì phải bật billing. |
| `collect/yahoo` trả `new_count: 0` | Các bài đó đã có trong MongoDB từ lần chạy trước. Không phải lỗi. |
| `ingest_news` dừng vì lệch số chiều vector | Đã đổi model embedding. Chạy lại với `--recreate` (A11). |
| `pip install` của prediction-service timeout | Đang tải torch bản CUDA ~2.5 GB (A10). |
| Email cảnh báo không tới | `EMAIL_STRATEGY=console` chỉ ghi log. Đặt `smtp` + `SMTP_*` (A3.4, A5). |

---

# PHẦN E — Những điều chưa được kiểm chứng

Nói thẳng để bạn biết chỗ nào cần cẩn thận:

**Đã kiểm chứng được** (Docker 28.4, build và chạy thật trên máy dev Windows):

- **`docker compose build web` chạy thành công.** Image `tradeus-web:latest`,
  1.46 GB, Next 16.3.1 build ra 13 route. Đây là lần build đầu tiên của
  `apps/web/Dockerfile` — nó đứt 2 lần trước khi qua, xem A1 và A2.
- **Container chạy được thật.** `next start` trả HTTP 200 (8841 bytes) sau ~1s
  khởi động, `HEALTHCHECK` chuyển sang `healthy` — nên `depends_on: web:
  service_healthy` của nginx (A3.2) sẽ hoạt động.
- **Domain đã nhúng đúng vào bundle.** `grep` trong `.next/static` thấy đủ 4 URL
  (`/api/v1`, `/prices`, `/alerts`, `/sentiment`) và **không còn**
  `localhost:3001`.
- **Toàn bộ 13 image build thành công** (`dc build`), sau khi sửa A6b, A10.
- **Cả 17 container chạy đồng thời, tất cả `healthy`** (`dc up -d`), sau khi sửa
  A8, A9. Thứ tự `depends_on: service_healthy` hoạt động đúng.
- **Luồng REST end-to-end qua nginx**, dùng đúng credential prod trong
  `.env.example`:
  - `POST /api/v1/auth/register` → tạo user thật trong MongoDB có mật khẩu
  - `POST /api/v1/auth/login` → JWT hợp lệ, payload `{"role":"user"}`, hạn 900s
    đúng bằng `JWT_ACCESS_EXPIRY=15m`
  - `GET /api/v1/admin/vip-requests` với token thường → **403** (RolesGuard chặn)
  - Chạy đúng lệnh `mongosh` ở B9 → `matchedCount: 1, modifiedCount: 1`
  - Đăng nhập lại → JWT `{"role":"admin"}`, endpoint admin → **200** kèm JSON
- **Socket.IO qua nginx** → handshake trả `sid` thật kèm `upgrades:["websocket"]`.
- **Chatbot end-to-end**: `POST /api/chatbot` → HTTP 200 `text/event-stream`,
  stream SSE về từ chat-agent-service (sau khi sửa A4).
- **Health nội bộ 6 service Python**: sentiment/email/alert/subscription/prediction
  đều `ok`, và quan trọng là chúng tự báo `mongodb: healthy`, `rabbitmq: healthy`,
  `redis: healthy` — tức mật khẩu RabbitMQ/Redis/Mongo trong prod overlay đều
  thông.
- **Degradation đúng như tài liệu mô tả**: không có `GEMINI_API_KEY` thì
  `chat-agent-service` báo `status: degraded` với
  `effective: rules, reason: no GEMINI_API_KEY configured` — không âm thầm giả vờ
  là AI.
- **`collector-price` chạy thật**: 102.600 message kline đã xử lý,
  `klineConnected: true, rabbitMQConnected: true`.
- `nginx -t` → `syntax is ok`; `/`, `/dashboard` → 200 `x-powered-by: Next.js`.
- **Đã chạy với `GEMINI_API_KEY` thật** (sau khi sửa A11):
  - `/health` của chat-agent → `effective: "gemini"`, `model: gemini-3.6-flash`
  - Phân tích sentiment bằng LLM thật → 16 bản ghi `backend: gemini`, có symbol,
    điểm số và lý do thực chất (không phải template)
  - `ingest_news` → tạo collection `news_chunks` 3072 chiều, embed 52/52 bài
  - `search_news "ETF inflows"` → 3 kết quả đúng chủ đề, cosine 0.649/0.643/0.633
  - `POST /api/chatbot` → trả lời tiếng Việt, **trích dẫn đúng 3 bài có thật**
    trong corpus, không còn dòng "Generated without an LLM"
  - Đổi `GEMINI_MODEL` trong `.env` + `dc up -d` → model đổi ngay, **không build
    lại image** (xác nhận wiring ở A11 hoạt động)
- `docker compose --env-file .env.example -f dev -f prod config` parse sạch; chỉ
  có 2 port công khai: `80` và `3000` với `host_ip: 127.0.0.1`.
- Cả 4 `build.args` vào đúng service `web` với giá trị `/api/v1` và 3 namespace WS.
- `CORS_ORIGINS` xuất hiện đúng 3 lần (api-gateway + 2 ws-gateway); 6 biến `SMTP_*`
  vào đúng `email-service`.
- Bỏ `.env` ra thì compose dừng ngay với
  `required variable CORS_ORIGINS is missing a value` — guard `:?` chạy đúng.
- `nginx.conf`: dấu `{}` cân bằng, 7 directive bắt buộc (`upstream web_app`,
  `server web:3000`, `location /`, `location /api`, `location /socket.io/`,
  `server_name _`, `proxy_pass http://web_app`) đều tồn tại và không bị comment.
- `email-service/app/config.py` parse được bằng `ast`; `grep` không còn tìm thấy
  app password lẫn địa chỉ Gmail cũ trong cả `config.py` và `.env.example`.
- `npm ls axios @tradex/shared-types --package-lock-only --workspace apps/web`
  resolve đúng cả hai.

**Chưa kiểm chứng được:**

- **Chưa deploy lên server thật.** Toàn bộ build/test ở trên chạy trên Windows +
  Docker Desktop, **không phải Ubuntu**. Chưa thử Caddy, chưa thử HTTPS, chưa thử
  domain thật — nghĩa là mục B2, B8 và toàn bộ phần chứng chỉ vẫn là lý thuyết.
- **Test chạy với `--env-file .env.example`**, tức domain giả
  `ten-mien-cua-ban.com` và mật khẩu `CHANGE_ME_*`. Đã chứng minh đường dây
  credential thông, nhưng chưa chứng minh gì về domain thật.
- **Chỉ test được ở mức free tier.** Quota chặn ở 20 request/model nên chưa biết
  hệ thống chịu tải thật ra sao. Scheduler chạy 5 phút/lần sẽ đốt quota rất
  nhanh — phải bật billing hoặc chuyển `SENTIMENT_BACKEND=local`.
- **`EMBEDDING_BACKEND=local` chưa test.** Nhánh đó cần `requirements-local.txt`
  (torch) bake vào image, hiện chưa có. Không có key thì phần tìm tin của chatbot
  **hỏng hẳn** (`No module named 'torch'`) chứ không degrade sạch.
- **Hai cảnh báo chưa xử lý** khi chạy `ingest_news`:
  - `google.generativeai` đã hết hỗ trợ, Google yêu cầu chuyển sang `google.genai`
  - Qdrant client 1.19.0 vs server 1.12.4 — lệch major, nên nâng ảnh Qdrant hoặc
    hạ client cho khớp
- **Chưa test gửi email thật** — `EMAIL_STRATEGY=console` suốt quá trình test.
- **`user-service` vẫn còn 3 bản `@nestjs/core` lồng nhau.** Nó khởi động bình
  thường nên tôi không đụng vào, nhưng đó là quả mìn hẹn giờ cùng loại với A8.
- **Lệnh `sed` trong A2 phụ thuộc chuỗi ký tự.** Nó khớp đúng
  `"@tradex/shared-types": "^1.0.0"`. Nếu A1 ghi phiên bản khác thì `sed` im lặng
  không làm gì và build đứt lại đúng chỗ cũ.
- **Image `web` nặng 1.46 GB** vì mang cả `node_modules` (`next start` thay vì
  `output: standalone`). Chạy được nhưng tốn dung lượng và thời gian pull/build.
  Đáng chuyển sang standalone sau khi deploy lần đầu thành công.
- **Chưa kiểm chứng thứ tự directive của Caddy bằng thực nghiệm.** Khuyến nghị ở
  B8 (một `reverse_proxy` duy nhất, hoặc dùng `handle`) là cách tránh vấn đề
  hoàn toàn chứ không phải kết luận về nội bộ Caddy.
- **`users.service.ts:48-53`**: nếu password người dùng gửi lên bắt đầu bằng
  `$2`, service coi đó là bcrypt hash sẵn và **lưu nguyên không hash**. Không
  chặn deploy nhưng là lỗi auth thật, nên sửa trước khi mở cho người ngoài dùng.
- **Chưa có monitoring/alerting.** Log rotation đã bật (10 MB × 3 file/container),
  nhưng không có gì báo cho bạn khi service chết ngoài `restart: always`.

---

# PHẦN F — Chạy thử nhanh trên máy local

Không cần `.env`, không cần file prod:

```bash
# shared-types phải build trước, apps/web import enum từ nó
npm install
npm run build --workspace @tradex/shared-types

docker compose -f docker-compose.dev.yml up -d
cd apps/web && npm run dev          # http://localhost:3000
```

Fallback trong code trỏ sẵn về `http://localhost:3001/api/v1` và
`http://localhost/{prices,alerts,sentiment}` nên không cần set `NEXT_PUBLIC_*`.

Cách này mở hết port ra `0.0.0.0`, nên **chỉ dùng khi máy không có IP public**.
