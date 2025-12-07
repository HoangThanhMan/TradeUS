# @tradex/auth-shared

Shared authentication utilities for Trade-X microservices.

## Features

- **JWT Service**: Generate and verify JWT tokens (access & refresh)
- **Password Service**: Hash and compare passwords with bcrypt
- **Guards**: JWT authentication and role-based authorization
- **Decorators**: Extract current user, define roles, mark public routes
- **Strategies**: Passport JWT strategy for NestJS

## Installation

```bash
npm install @tradex/auth-shared
```

## Usage

### JWT Service

```typescript
import { JwtService } from '@tradex/auth-shared';

const jwtService = new JwtService({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
});

// Generate tokens
const tokens = jwtService.generateTokens({
  sub: user._id,
  email: user.email,
  role: user.role,
});

// Verify token
const payload = jwtService.verifyAccessToken(token);
```

### Password Service

```typescript
import { PasswordService } from '@tradex/auth-shared';

const passwordService = new PasswordService(10); // salt rounds

// Hash password
const hashed = await passwordService.hashPassword('myPassword123!');

// Compare password
const isValid = await passwordService.comparePassword('myPassword123!', hashed);

// Validate strength
const validation = passwordService.validatePasswordStrength('weak');
```

### Guards & Decorators

```typescript
import {
  JwtAuthGuard,
  RolesGuard,
  CurrentUser,
  Roles,
  Public,
} from '@tradex/auth-shared';
import { UserRole, IJwtPayload } from '@tradex/shared-types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  @Get('profile')
  getProfile(@CurrentUser() user: IJwtPayload) {
    return user;
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  adminOnly() {
    return 'Admin only route';
  }

  @Post('public')
  @Public()
  publicRoute() {
    return 'No auth required';
  }
}
```

### JWT Strategy (NestJS)

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '@tradex/auth-shared';

@Module({
  imports: [PassportModule],
  providers: [
    {
      provide: JwtStrategy,
      useFactory: () => {
        return new JwtStrategy({
          jwtSecret: process.env.JWT_ACCESS_SECRET,
        });
      },
    },
  ],
})
export class AuthModule {}
```

## Environment Variables

```env
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
```

## License

ISC
