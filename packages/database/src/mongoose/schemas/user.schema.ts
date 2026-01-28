import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IUser, UserRole, VipStatus, VipPlan } from '@tradex/shared-types';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User implements IUser {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true, trim: true })
  username!: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({
    required: true,
    enum: UserRole,
    default: UserRole.USER,
  })
  role!: UserRole;

  @Prop({
    enum: VipStatus,
    default: VipStatus.NONE,
  })
  vipStatus?: VipStatus;

  @Prop({
    enum: VipPlan,
  })
  vipPlan?: VipPlan;

  @Prop()
  vipExpiry?: Date;

  @Prop()
  vipRequestedAt?: Date;

  _id?: string;
  createdAt!: Date;
  updatedAt?: Date;
}

export const userSchema = SchemaFactory.createForClass(User);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ vipStatus: 1 });

userSchema.virtual('id').get(function (this: UserDocument) {
  return this._id.toHexString();
});

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (_doc, ret: any) {
    delete ret._id;
    delete ret.password;
    return ret;
  },
});

userSchema.pre('save', function (next) {
  next();
});
