import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { VipPlan } from '../types/user.types';

export class CreateVipRequestDto {
  plan!: VipPlan;
}

export class ProcessVipRequestDto {
  action!: 'approve' | 'reject';
  note?: string;
}

export class UpdateQrConfigDto {
  @IsString()
  bankId!: string;

  @IsString()
  bankName!: string;

  @IsString()
  accountNo!: string;

  @IsString()
  accountName!: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsNumber()
  @Min(0)
  monthlyPrice!: number;

  @IsNumber()
  @Min(0)
  yearlyPrice!: number;
}