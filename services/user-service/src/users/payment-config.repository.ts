import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AbstractRepository,
  QRConfig,
  QRConfigDocument,
} from '@tradex/database';

@Injectable()
export class QRConfigRepository extends AbstractRepository<QRConfigDocument> {
  protected readonly logger = new Logger(QRConfigRepository.name);

  constructor(
    @InjectModel(QRConfig.name)
    qrConfigModel: Model<QRConfigDocument>,
  ) {
    super(qrConfigModel);
  }

  // Get the active QR config
  async getActiveConfig(): Promise<QRConfigDocument | null> {
    return this.findOne({ isActive: true });
  }

  // Create new QR config
  async createConfig(
    configData: Partial<QRConfigDocument>,
    createdBy?: string,
  ): Promise<QRConfigDocument> {
    // Deactivate all existing configs
    await this.model.updateMany({}, { $set: { isActive: false } });

    return this.create({
      ...configData,
      isActive: true,
      createdBy,
      lastUpdatedBy: createdBy,
    } as QRConfigDocument);
  }

  // Update QR config
  async updateConfig(
    id: string,
    configData: Partial<QRConfigDocument>,
    updatedBy?: string,
  ): Promise<QRConfigDocument> {
    return this.findByIdAndUpdate(id, {
      $set: {
        ...configData,
        lastUpdatedBy: updatedBy,
      },
    });
  }

  // Update or create QR config (upsert)
  async upsertConfig(
    configData: Partial<QRConfigDocument>,
    userId?: string,
  ): Promise<QRConfigDocument> {
    const existingConfig = await this.getActiveConfig();

    if (existingConfig) {
      return this.updateConfig(existingConfig._id!.toString(), configData, userId);
    }

    return this.createConfig(configData, userId);
  }

  // Get all configs (including inactive)
  async getAllConfigs(): Promise<QRConfigDocument[]> {
    return this.model.find().sort({ createdAt: -1 }).lean<QRConfigDocument[]>();
  }
}
