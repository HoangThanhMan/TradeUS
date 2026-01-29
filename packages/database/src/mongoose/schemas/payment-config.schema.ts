import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QRConfigDocument = QRConfig & Document;

export interface IQRConfig {
  _id?: string;
  bankId: string;
  accountNo: string;
  template: string;
  accountName: string;
  monthlyAmount: number;
  yearlyAmount: number;
  isActive: boolean;
  createdBy?: Types.ObjectId | string;
  lastUpdatedBy?: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Schema({
  timestamps: true,
  collection: 'qr_configs',
})
export class QRConfig implements IQRConfig {
  @Prop({ required: true })
  bankId!: string;

  @Prop({ required: true })
  accountNo!: string;

  @Prop({ required: true, default: 'compact2' })
  template!: string;

  @Prop({ required: true })
  accountName!: string;

  @Prop({ required: true, default: 99000 })
  monthlyAmount!: number;

  @Prop({ required: true, default: 999000 })
  yearlyAmount!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastUpdatedBy?: Types.ObjectId;

  _id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const qrConfigSchema = SchemaFactory.createForClass(QRConfig);

qrConfigSchema.virtual('id').get(function (this: QRConfigDocument) {
  return this._id.toHexString();
});

qrConfigSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (_doc, ret: any) {
    delete ret._id;
    return ret;
  },
});
