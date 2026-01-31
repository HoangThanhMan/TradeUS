import { Module, DynamicModule, Global } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtService as CustomJwtService } from './services/jwt.service';
import { PasswordService } from './services/password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({})
export class AuthSharedModule {
  static forRoot(options: {
    jwtSecret: string;
    jwtAccessExpiry?: string;
    jwtRefreshExpiry?: string;
    bcryptSaltRounds?: number;
  }): DynamicModule {
    return {
      module: AuthSharedModule,
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: options.jwtSecret,
          signOptions: {
            expiresIn: options.jwtAccessExpiry || '15m',
          },
        }),
      ],
      providers: [
        {
          provide: CustomJwtService,
          useFactory: () => {
            return new CustomJwtService({
              accessTokenSecret: options.jwtSecret,
              refreshTokenSecret: options.jwtSecret,
              accessTokenExpiry: options.jwtAccessExpiry || '15m',
              refreshTokenExpiry: options.jwtRefreshExpiry || '7d',
            });
          },
        },
        {
          provide: PasswordService,
          useFactory: () => {
            return new PasswordService(options.bcryptSaltRounds || 10);
          },
        },
        {
          provide: JwtStrategy,
          useFactory: () => {
            return new JwtStrategy({ jwtSecret: options.jwtSecret });
          },
        },
        Reflector,
        JwtAuthGuard,
        RolesGuard,
      ],
      exports: [
        CustomJwtService,
        PasswordService,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        JwtModule,
        PassportModule,
      ],
    };
  }
}
