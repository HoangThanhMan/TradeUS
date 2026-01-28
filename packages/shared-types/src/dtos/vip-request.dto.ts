import { VipPlan } from '../types/user.types';

export class CreateVipRequestDto {
  plan!: VipPlan;
}

export class ProcessVipRequestDto {
  action!: 'approve' | 'reject';
  note?: string;
}

export class UpdateQrConfigDto {
  bankId!: string;
  bankName!: string;
  accountNo!: string;
  accountName!: string;
  template?: string;
  monthlyPrice!: number;
  yearlyPrice!: number;
}