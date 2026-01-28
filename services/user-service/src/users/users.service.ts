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
  VipStatus,
} from '@tradex/shared-types';
import { PasswordService } from '@tradex/auth-shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
  ) {}

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

    // Hash password if not already hashed (check if it looks like bcrypt hash)
    let hashedPassword = createUserDto.password;
    if (!createUserDto.password.startsWith('$2')) {
      hashedPassword = await this.passwordService.hashPassword(
        createUserDto.password,
      );
    }

    const user = await this.usersRepository.create({
      email: createUserDto.email.toLowerCase(),
      password: hashedPassword,
      username: createUserDto.username,
      name: createUserDto.name,
      role: UserRole.USER,
      vipStatus: VipStatus.NONE,
    } as any);

    return this.excludePassword(user);
  }

  async findAll(
    page = 1,
    limit = 10,
  ): Promise<{
    users: Omit<UserDocument, 'password'>[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const users = await this.usersRepository.findWithPagination(
      {},
      skip,
      limit,
    );
    const total = await this.usersRepository.count({});

    return {
      users: users.map((user) => this.excludePassword(user)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Omit<UserDocument, 'password'>> {
    this.logger.log(`Finding user by id: ${id}`);
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.excludePassword(user);
  }

  async findById(id: string): Promise<Omit<UserDocument, 'password'>> {
    return this.findOne(id);
  }

  async findByEmail(email: string): Promise<Omit<UserDocument, 'password'>> {
    const user = await this.usersRepository.findByEmail(email.toLowerCase());
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.excludePassword(user);
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.usersRepository.findByEmail(email.toLowerCase());
  }

  async findByUsername(
    username: string,
  ): Promise<Omit<UserDocument, 'password'>> {
    const user = await this.usersRepository.findByUsername(username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.excludePassword(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<UserDocument, 'password'>> {
    this.logger.log(`Updating user: ${id}`);

    const existingUser = await this.usersRepository.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check for email uniqueness if updating email
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.usersRepository.existsByEmail(
        updateUserDto.email,
      );
      if (emailExists) {
        throw new ConflictException('Email already exists');
      }
    }

    // Check for username uniqueness if updating username
    if (
      updateUserDto.username &&
      updateUserDto.username !== existingUser.username
    ) {
      const usernameExists = await this.usersRepository.existsByUsername(
        updateUserDto.username,
      );
      if (usernameExists) {
        throw new ConflictException('Username already exists');
      }
    }

    const updatedUser = await this.usersRepository.findByIdAndUpdate(id, {
      $set: {
        ...updateUserDto,
        email: updateUserDto.email?.toLowerCase(),
      },
    });

    return this.excludePassword(updatedUser);
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing user: ${id}`);

    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const deleted = await this.usersRepository.deleteById(id);
    if (!deleted) {
      throw new BadRequestException('Failed to delete user');
    }
  }

  async changePassword(
    id: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid = await this.passwordService.comparePassword(
      changePasswordDto.oldPassword,
      user.password,
    );

    if (!isOldPasswordValid) {
      throw new BadRequestException('Old password is incorrect');
    }

    // Validate new password strength
    const validation = this.passwordService.validatePasswordStrength(
      changePasswordDto.newPassword,
    );
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    const hashedPassword = await this.passwordService.hashPassword(
      changePasswordDto.newPassword,
    );

    await this.usersRepository.findByIdAndUpdate(id, {
      $set: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async updateRole(
    id: string,
    role: string,
  ): Promise<Omit<UserDocument, 'password'>> {
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException('Invalid role');
    }

    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.usersRepository.findByIdAndUpdate(id, {
      $set: { role: role as UserRole },
    });

    return this.excludePassword(updatedUser);
  }

  async upgradeToVip(
    id: string,
    expiryDays: number,
  ): Promise<Omit<UserDocument, 'password'>> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const vipExpiry = new Date();
    vipExpiry.setDate(vipExpiry.getDate() + expiryDays);

    const updatedUser = await this.usersRepository.findByIdAndUpdate(id, {
      $set: {
        role: UserRole.VIP,
        vipStatus: VipStatus.ACTIVE,
        vipExpiry: vipExpiry,
      },
    });

    return this.excludePassword(updatedUser);
  }

  async checkEmailExists(email: string): Promise<{ exists: boolean }> {
    const exists = await this.usersRepository.existsByEmail(
      email.toLowerCase(),
    );
    return { exists };
  }

  async checkUsernameExists(username: string): Promise<{ exists: boolean }> {
    const exists = await this.usersRepository.existsByUsername(username);
    return { exists };
  }

  private excludePassword(user: UserDocument): Omit<UserDocument, 'password'> {
    const userObj = user as any;
    const { password, ...userWithoutPassword } = userObj;
    return userWithoutPassword as Omit<UserDocument, 'password'>;
  }
}
