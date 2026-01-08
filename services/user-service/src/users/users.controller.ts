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
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
} from '@tradex/shared-types';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.usersService.findAll(page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Put(':id/password')
  changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(id, changePasswordDto);
  }

  @Put(':id/role')
  updateRole(@Param('id') id: string, @Body('role') role: string) {
    return this.usersService.updateRole(id, role);
  }

  @Put(':id/vip')
  upgradeToVip(
    @Param('id') id: string,
    @Body('expiryDays') expiryDays: number,
  ) {
    return this.usersService.upgradeToVip(id, expiryDays);
  }

  // Internal endpoints (used by API Gateway)
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
    9;
  }

  @Get('check/username/:username')
  checkUsernameExists(@Param('username') username: string) {
    return this.usersService.checkUsernameExists(username);
  }
}
