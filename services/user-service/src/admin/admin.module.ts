import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { 
  QrConfig, 
  qrConfigSchema, 
  VipRequest, 
  vipRequestSchema,
  User,
  userSchema 
} from '@tradex/database';
import { AuthSharedModule } from '@tradex/auth-shared';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QrConfig.name, schema: qrConfigSchema },
      { name: VipRequest.name, schema: vipRequestSchema },
      { name: User.name, schema: userSchema },
    ]),
    AuthSharedModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}