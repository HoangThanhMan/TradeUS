import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  QrConfig, 
  QrConfigDocument, 
  VipRequest, 
  VipRequestDocument,
  VipRequestStatus,
  User,
  UserDocument 
} from '@tradex/database';
import { UpdateQrConfigDto, VipPlan, VipStatus, UserRole } from '@tradex/shared-types';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(QrConfig.name) private qrConfigModel: Model<QrConfigDocument>,
    @InjectModel(VipRequest.name) private vipRequestModel: Model<VipRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // =================== QR Config ===================
  async getQrConfig(): Promise<QrConfigDocument | null> {
    return this.qrConfigModel.findOne({ isActive: true }).exec();
  }

  async updateQrConfig(dto: UpdateQrConfigDto): Promise<QrConfigDocument> {
    // Deactivate all existing configs
    await this.qrConfigModel.updateMany({}, { isActive: false });

    // Create new active config
    const config = new this.qrConfigModel({
      ...dto,
      template: dto.template || 'compact2',
      isActive: true,
    });

    return config.save();
  }

  // =================== VIP Requests ===================
  async createVipRequest(
    userId: string,
    username: string,
    email: string,
    plan: VipPlan,
  ): Promise<VipRequestDocument> {
    // Check if user already has a pending request
    const existingRequest = await this.vipRequestModel.findOne({
      userId,
      status: VipRequestStatus.PENDING,
    });

    if (existingRequest) {
      throw new BadRequestException('You already have a pending VIP request');
    }

    // Get current QR config for pricing
    const qrConfig = await this.getQrConfig();
    const amount = plan === VipPlan.MONTHLY 
      ? (qrConfig?.monthlyPrice || 99000)
      : (qrConfig?.yearlyPrice || 990000);

    const request = new this.vipRequestModel({
      userId,
      username,
      email,
      plan,
      amount,
      status: VipRequestStatus.PENDING,
    });

    // Update user's vipStatus to PENDING
    await this.userModel.findByIdAndUpdate(userId, {
      vipStatus: VipStatus.PENDING,
      vipPlan: plan,
      vipRequestedAt: new Date(),
    });

    return request.save();
  }

  async getPendingRequests(): Promise<VipRequestDocument[]> {
    return this.vipRequestModel
      .find({ status: VipRequestStatus.PENDING })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getAllRequests(page = 1, limit = 20): Promise<{
    requests: VipRequestDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const [requests, total] = await Promise.all([
      this.vipRequestModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.vipRequestModel.countDocuments(),
    ]);

    return {
      requests,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveVipRequest(
    requestId: string,
    adminId: string,
  ): Promise<VipRequestDocument> {
    const request = await this.vipRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('VIP request not found');
    }

    if (request.status !== VipRequestStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    // Calculate expiry date based on plan
    const expiryDate = new Date();
    if (request.plan === VipPlan.MONTHLY) {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }

    // Update user to VIP
    await this.userModel.findByIdAndUpdate(request.userId, {
      role: UserRole.VIP,
      vipStatus: VipStatus.ACTIVE,
      vipPlan: request.plan,
      vipExpiry: expiryDate,
    });

    // Update request status
    request.status = VipRequestStatus.APPROVED;
    request.processedBy = adminId as any;
    request.processedAt = new Date();

    return request.save();
  }

  async rejectVipRequest(
    requestId: string,
    adminId: string,
    note?: string,
  ): Promise<VipRequestDocument> {
    const request = await this.vipRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('VIP request not found');
    }

    if (request.status !== VipRequestStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    // Update user's vipStatus back to NONE
    await this.userModel.findByIdAndUpdate(request.userId, {
      vipStatus: VipStatus.NONE,
      vipPlan: null,
    });

    // Update request status
    request.status = VipRequestStatus.REJECTED;
    request.processedBy = adminId as any;
    request.processedAt = new Date();
    request.note = note;

    return request.save();
  }
}