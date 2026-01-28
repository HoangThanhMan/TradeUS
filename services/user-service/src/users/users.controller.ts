import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards, // <--- 1. Import thêm UseGuards
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  UserRole, // <--- 2. Import Enum UserRole
} from '@tradex/shared-types';
// <--- 3. Import các Guard bảo mật từ auth-shared
import { JwtAuthGuard, RolesGuard, Roles } from '@tradex/auth-shared';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Đăng ký (Public - ai cũng được gọi)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // Lấy danh sách users -> CHỈ ADMIN
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard) // <--- Bắt buộc đăng nhập & check quyền
  @Roles(UserRole.ADMIN)               // <--- Chỉ Admin mới được vào
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.usersService.findAll(page, limit);
  }

  // Xem chi tiết user -> Cần đăng nhập
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // Cập nhật thông tin -> Cần đăng nhập
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  // Xóa user -> CHỈ ADMIN
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // Đổi mật khẩu -> Cần đăng nhập
  @Put(':id/password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(id, changePasswordDto);
  }

  // Cập nhật Role -> CHỈ ADMIN (Cực kỳ quan trọng)
  @Put(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRole(@Param('id') id: string, @Body('role') role: string) {
    return this.usersService.updateRole(id, role);
  }

  // Kích hoạt VIP thủ công -> CHỈ ADMIN
  @Put(':id/vip')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upgradeToVip(
    @Param('id') id: string,
    @Body('expiryDays') expiryDays: number,
  ) {
    return this.usersService.upgradeToVip(id, expiryDays);
  }

  // --- INTERNAL ENDPOINTS (Giữ nguyên) ---
  @Get('internal/by-email/:email')
  findByEmailInternal(@Param('email') email: string) {
    return this.usersService.findByEmailWithPassword(email);
  }

  @Get('by-email/:email')
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('by-username/:username')
  findByUsername(@Param('username') username: string) {
    return this.usersService.findByUsername(username);
  }

  @Get('check/email/:email')
  checkEmailExists(@Param('email') email: string) {
    return this.usersService.checkEmailExists(email);
  }

  @Get('check/username/:username')
  checkUsernameExists(@Param('username') username: string) {
    return this.usersService.checkUsernameExists(username);
  }
}