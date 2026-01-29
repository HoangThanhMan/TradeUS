import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  QR_TRANSFER = 'qr_transfer',
  BANK_TRANSFER = 'bank_transfer',
  MOMO = 'momo',
  ZALOPAY = 'zalopay',
}

export enum Currency {
  VND = 'VND',
  USD = 'USD',
}

export interface IPayment {
  _id?: string;
  userId: Types.ObjectId | string;
  amount: number;
  status: PaymentStatus;
  currency: Currency;
  paymentMethod: PaymentMethod;
  description?: string;
  metadata?: Record<string, any>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

@Schema({
  timestamps: true,
  collection: 'payments',
})
export class Payment implements IPayment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({
    required: true,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    index: true,
  })
  status!: PaymentStatus;

  @Prop({
    required: true,
    enum: Currency,
    default: Currency.VND,
  })
  currency!: Currency;

  @Prop({
    required: true,
    enum: PaymentMethod,
    default: PaymentMethod.QR_TRANSFER,
  })
  paymentMethod!: PaymentMethod;

  @Prop()
  description?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  completedAt?: Date;

  _id?: string;
  createdAt!: Date;
  updatedAt?: Date;
}

export const paymentSchema = SchemaFactory.createForClass(Payment);

// Indexes
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

paymentSchema.virtual('id').get(function (this: PaymentDocument) {
  return this._id.toHexString();
});

paymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (_doc, ret: any) {
    delete ret._id;
    return ret;
  },
});
