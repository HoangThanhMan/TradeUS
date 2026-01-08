import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as bcrypt from 'bcrypt';
import {
  LoginDto,
  CreateUserDto,
  IJwtPayload,
  IAuthTokens,
} from '@tradex/shared-types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly userServiceUrl: string;
  private readonly jwtSecret: string;
  private readonly refreshExpiry: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.userServiceUrl = this.configService.get<string>(
      'services.userService',
    )!;
    this.jwtSecret = this.configService.get<string>('jwt.secret')!;
    this.refreshExpiry = this.configService.get<string>('jwt.refreshExpiry')!;
  }

  async validateUser(email: string, password: string): Promise<any> {
    try {
      // Fetch user from user-service
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.userServiceUrl}/users/internal/by-email/${email}`,
        ),
      );

      const user = response.data;
      if (!user) {
        return null;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return null;
      }

      // Return user without password
      const { password: _, ...result } = user;
      return result;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      this.logger.error('Error validating user:', error.message);
      throw new InternalServerErrorException('Error validating credentials');
    }
  }

  async login(loginDto: LoginDto): Promise<IAuthTokens & { user: any }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = this.generateTokens(user);

    this.logger.log(`User logged in: ${user.email}`);

    return {
      ...tokens,
      user,
    };
  }

  async register(
    createUserDto: CreateUserDto,
  ): Promise<IAuthTokens & { user: any }> {
    try {
      // Hash password before sending to user-service
      const saltRounds =
        this.configService.get<number>('bcrypt.saltRounds') || 10;
      const hashedPassword = await bcrypt.hash(
        createUserDto.password,
        saltRounds,
      );

      // Create user via user-service
      const response = await firstValueFrom(
        this.httpService.post(`${this.userServiceUrl}/users`, {
          ...createUserDto,
          password: hashedPassword,
        }),
      );

      const user = response.data;

      // Generate tokens
      const tokens = this.generateTokens(user);

      this.logger.log(`New user registered: ${user.email}`);

      return {
        ...tokens,
        user,
      };
    } catch (error: any) {
      this.logger.error('Registration error:', error.message);

      if (error.response?.status === 409) {
        throw new BadRequestException(
          error.response.data.message || 'User already exists',
        );
      }

      throw new InternalServerErrorException('Error creating user');
    }
  }

  async refreshTokens(refreshToken: string): Promise<IAuthTokens> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.jwtSecret,
      });

      // Fetch fresh user data
      const response = await firstValueFrom(
        this.httpService.get(`${this.userServiceUrl}/users/${payload.userId}`),
      );

      const user = response.data;
      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.userServiceUrl}/users/${userId}`),
      );
      return response.data;
    } catch (error) {
      throw new UnauthorizedException('User not found');
    }
  }

  private generateTokens(user: any): IAuthTokens {
    const payload: Omit<IJwtPayload, 'iat' | 'exp'> = {
      userId: user._id || user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(
      { userId: payload.userId },
      { expiresIn: this.refreshExpiry },
    );

    return {
      accessToken,
      refreshToken,
    };
  }
}
