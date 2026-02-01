import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController, VipController } from './admin.controller';
import { AdminService } from './admin.service';
import {
  QrConfig,
  qrConfigSchema,
  VipRequest,
  vipRequestSchema,
  User,
  userSchema,
} from '@tradex/database';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QrConfig.name, schema: qrConfigSchema },
      { name: VipRequest.name, schema: vipRequestSchema },
      { name: User.name, schema: userSchema },
    ]),
  ],
  controllers: [AdminController, VipController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
