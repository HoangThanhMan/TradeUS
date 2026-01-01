import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, userSchema } from '@tradex/database';
import { PasswordService } from '@tradex/auth-shared';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: userSchema }]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    {
      provide: PasswordService,
      useFactory: () => new PasswordService(10), // 10 is salt rounds
    },
  ],
  exports: [UsersService, UsersRepository, PasswordService],
})
export class UsersModule {}
