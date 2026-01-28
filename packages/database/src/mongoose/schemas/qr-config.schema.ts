import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QrConfigDocument = QrConfig & Document;

@Schema({
  timestamps: true,
  collection: 'qr_configs',
})
export class QrConfig {
  @Prop({ required: true })
  bankId!: string;

  @Prop({ required: true })
  bankName!: string;

  @Prop({ required: true })
  accountNo!: string;

  @Prop({ required: true })
  accountName!: string;

  @Prop({ required: true, default: 'compact2' })
  template!: string;

  @Prop({ required: true })
  monthlyPrice!: number;

  @Prop({ required: true })
  yearlyPrice!: number;

  @Prop({ default: true })
  isActive!: boolean;

  _id?: string;
  createdAt!: Date;
  updatedAt?: Date;
}

export const qrConfigSchema = SchemaFactory.createForClass(QrConfig);