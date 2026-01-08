import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtPayload } from '@tradex/shared-types';

export interface JwtStrategyOptions {
  jwtSecret: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(options: JwtStrategyOptions) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: options.jwtSecret,
    });
  }

  async validate(payload: IJwtPayload): Promise<IJwtPayload> {
    if (!payload.userId || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}
