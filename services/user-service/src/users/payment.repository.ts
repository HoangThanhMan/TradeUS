import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, SortOrder } from 'mongoose';
import {
  AbstractRepository,
  Payment,
  PaymentDocument,
  PaymentStatus,
} from '@tradex/database';

@Injectable()
export class PaymentRepository extends AbstractRepository<PaymentDocument> {
  protected readonly logger = new Logger(PaymentRepository.name);

  constructor(
    @InjectModel(Payment.name)
    paymentModel: Model<PaymentDocument>,
  ) {
    super(paymentModel);
  }

  // Find payments by user ID
  async findByUserId(
    userId: string,
    skip = 0,
    limit = 10,
  ): Promise<PaymentDocument[]> {
    return this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<PaymentDocument[]>();
  }

  // Find payments by status
  async findByStatus(
    status: PaymentStatus,
    skip = 0,
    limit = 10,
  ): Promise<PaymentDocument[]> {
    return this.model
      .find({ status })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<PaymentDocument[]>();
  }

  // Find payments with filters
  async findWithFilters(
    filters: {
      userId?: string;
      status?: string;
      paymentMethod?: string;
      startDate?: Date;
      endDate?: Date;
    },
    skip: number,
    limit: number,
    sort: Record<string, SortOrder> = { createdAt: -1 },
  ): Promise<PaymentDocument[]> {
    const query: FilterQuery<PaymentDocument> = {};

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.paymentMethod) {
      query.paymentMethod = filters.paymentMethod;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    return this.model
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean<PaymentDocument[]>();
  }

  // Count payments with filters
  async countWithFilters(filters: {
    userId?: string;
    status?: string;
    paymentMethod?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    const query: FilterQuery<PaymentDocument> = {};

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.paymentMethod) {
      query.paymentMethod = filters.paymentMethod;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    return this.model.countDocuments(query);
  }

  // Update payment status
  async updateStatus(
    paymentId: string,
    status: PaymentStatus,
    completedAt?: Date,
    metadata?: Record<string, any>,
  ): Promise<PaymentDocument> {
    const updateData: any = { status };
    
    if (completedAt) {
      updateData.completedAt = completedAt;
    } else if (status === PaymentStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }

    if (metadata) {
      updateData.metadata = metadata;
    }

    return this.findByIdAndUpdate(paymentId, { $set: updateData });
  }

  // Count payments by status
  async countByStatus(status: PaymentStatus): Promise<number> {
    return this.model.countDocuments({ status });
  }

  // Count payments by user ID
  async countByUserId(userId: string): Promise<number> {
    return this.model.countDocuments({ userId });
  }

  // Count pending payments
  async countPending(): Promise<number> {
    return this.model.countDocuments({ status: PaymentStatus.PENDING });
  }

  // Calculate total revenue from completed payments
  async calculateTotalRevenue(): Promise<number> {
    const result = await this.model.aggregate([
      { $match: { status: PaymentStatus.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  // Get user's latest payment
  async findLatestByUserId(userId: string): Promise<PaymentDocument | null> {
    return this.model
      .findOne({ userId })
      .sort({ createdAt: -1 })
      .lean<PaymentDocument>();
  }
}
