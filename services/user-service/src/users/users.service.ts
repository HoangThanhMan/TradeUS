import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { UserDocument } from '@tradex/database';
import { UsersRepository } from './users.repository';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  UserRole,
} from '@tradex/shared-types';
import { PasswordService } from '@tradex/auth-shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  async create(
    createUserDto: CreateUserDto,
  ): Promise<Omit<UserDocument, 'password'>> {
    this.logger.log(`Creating new user with email: ${createUserDto.email}`);
    const emailExists = await this.usersRepository.existsByEmail(
      createUserDto.email,
    );
    if (emailExists) {
      throw new ConflictException('Email already exists');
    }
    const usernameExists = await this.usersRepository.existsByUsername(
      createUserDto.username,
    );
    if (usernameExists) {
      throw new ConflictException('Username already exists');
    }
    const user = await this.usersRepository.create({
      email: createUserDto.email,
      password: createUserDto.password,
      username: createUserDto.username,
      name: createUserDto.name,
      role: createUserDto.role || UserRole.USER,
    } as any);

    const { password, ...userWithoutPassword } = user as any;
    return userWithoutPassword as Omit<UserDocument, 'password'>;
  }

  async findById(is: string) {
    const user = await this.usersRepository.findById(is);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll() {
    return this.usersRepository.find({});
  }

  async findOne(id: string): Promise<Omit<UserDocument, 'password'>> {
    this.logger.log(`Finding user by id: ${id}`);
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...userWithoutPassword } = user as any;
    return userWithoutPassword as Omit<UserDocument, 'password'>;
  }
}
