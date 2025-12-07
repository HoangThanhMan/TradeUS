import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from '@tradex/shared-types';

@Controller('users')
export class UsersController {
  constructor(private readonly userServices: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userServices.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.userServices.findAll();
  }

  @Get(':id')
  findById() {
    return this.userServices.findById;
  }

  @Get('by-email/:email')
  findByEmail() {
    return this.userServices.findByEmail;
  }
}
