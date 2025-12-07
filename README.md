# Trade-X

## Cài đặt

```bash
# Clone repository
git clone https://github.com/HoangThanhMan/Trade-X.git
cd Trade-X

# Cài đặt dependencies
npm install
```

## Cấu hình

Tạo file `.env` trong `services/user-service/`:

```env
MONGODB_URI=mongodb://localhost:27017/tradex
PORT=3001
```

## Build shared packages

```bash
# Build shared-types package
npm run build -w @tradex/shared-types

# Build database package
npm run build -w @tradex/database

# Build auth-shared package  
npm run build -w @tradex/auth-shared

```

## Chạy services

### User Service

```bash
# Development mode
npm run start:dev -w user-service

# Production mode
npm run start -w user-service
```

## Scripts

```bash
# Build tất cả packages
npm run build

# Run development mode
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Technologies

- **Backend**: NestJS, MongoDB, Mongoose
- **Frontend**: Next.js, React, TailwindCSS
- **Monorepo**: npm workspaces, Turbo

## License

UNLICENSED
