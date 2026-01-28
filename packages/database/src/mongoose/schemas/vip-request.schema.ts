import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { VipPlan } from '@tradex/shared-types';

export enum VipRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export type VipRequestDocument = VipRequest & Document;

@Schema({
  timestamps: true,
  collection: 'vip_requests',
})
export class VipRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true, enum: VipPlan })
  plan!: VipPlan;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, enum: VipRequestStatus, default: VipRequestStatus.PENDING })
  status!: VipRequestStatus;

  @Prop()
  note?: string;

  @Prop()
  processedBy?: Types.ObjectId;

  @Prop()
  processedAt?: Date;

  _id?: string;
  createdAt!: Date;
  updatedAt?: Date;
}

export const vipRequestSchema = SchemaFactory.createForClass(VipRequest);

vipRequestSchema.index({ userId: 1 });
vipRequestSchema.index({ status: 1 });
vipRequestSchema.index({ createdAt: -1 });