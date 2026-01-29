import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AbstractRepository,
  QrConfig,
  QrConfigDocument,
} from '@tradex/database';

@Injectable()
export class QRConfigRepository extends AbstractRepository<QrConfigDocument> {
  protected readonly logger = new Logger(QRConfigRepository.name);

  constructor(
    @InjectModel(QrConfig.name)
    qrConfigModel: Model<QrConfigDocument>,
  ) {
    super(qrConfigModel);
  }

  // Get the active QR config
  async getActiveConfig(): Promise<QrConfigDocument | null> {
    return this.findOne({ isActive: true });
  }

  // Create new QR config
  async createConfig(
    configData: Partial<QrConfigDocument>,
    createdBy?: string,
  ): Promise<QrConfigDocument> {
    // Deactivate all existing configs
    await this.model.updateMany({}, { $set: { isActive: false } });

    return this.create({
      ...configData,
      isActive: true,
      createdBy,
      lastUpdatedBy: createdBy,
    } as QrConfigDocument);
  }

  // Update QR config
  async updateConfig(
    id: string,
    configData: Partial<QrConfigDocument>,
    updatedBy?: string,
  ): Promise<QrConfigDocument> {
    return this.findByIdAndUpdate(id, {
      $set: {
        ...configData,
        lastUpdatedBy: updatedBy,
      },
    });
  }

  // Update or create QR config (upsert)
  async upsertConfig(
    configData: Partial<QrConfigDocument>,
    userId?: string,
  ): Promise<QrConfigDocument> {
    const existingConfig = await this.getActiveConfig();

    if (existingConfig) {
      return this.updateConfig(
        existingConfig._id!.toString(),
        configData,
        userId,
      );
    }

    return this.createConfig(configData, userId);
  }

  // Get all configs (including inactive)
  async getAllConfigs(): Promise<QrConfigDocument[]> {
    return this.model.find().sort({ createdAt: -1 }).lean<QrConfigDocument[]>();
  }
}
