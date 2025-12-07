import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { IJwtPayload, IAuthTokens } from '@tradex/shared-types';

export interface JwtConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
}

@Injectable()
export class JwtService {
  private config: JwtConfig;

  constructor(config: JwtConfig) {
    this.config = config;
  }

  /**
   * Generate access and refresh tokens
   */
  generateTokens(payload: Omit<IJwtPayload, 'iat' | 'exp'>): IAuthTokens {
    const accessToken = jwt.sign(
      payload as object,
      this.config.accessTokenSecret,
      {
        expiresIn: this.config.accessTokenExpiry,
      } as jwt.SignOptions,
    );

    const refreshToken = jwt.sign(
      { userId: payload.userId } as object,
      this.config.refreshTokenSecret,
      {
        expiresIn: this.config.refreshTokenExpiry,
      } as jwt.SignOptions,
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Generate only access token
   */
  generateAccessToken(payload: Omit<IJwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload as object, this.config.accessTokenSecret, {
      expiresIn: this.config.accessTokenExpiry,
    } as jwt.SignOptions);
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): IJwtPayload {
    try {
      return jwt.verify(token, this.config.accessTokenSecret) as IJwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, this.config.refreshTokenSecret) as {
        userId: string;
      };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Decode token without verification
   */
  decodeToken(token: string): IJwtPayload | null {
    try {
      return jwt.decode(token) as IJwtPayload;
    } catch (error) {
      return null;
    }
  }
}
