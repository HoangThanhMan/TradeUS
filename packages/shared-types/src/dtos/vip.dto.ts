import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, IsUrl, Min, ValidateIf, IsObject } from 'class-validator';

export class UpgradeRequestDto {
  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectVipDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

// Legacy DTO - kept for backward compatibility
export class PaymentConfigDto {
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  accountHolder!: string;

  @IsOptional()
  @ValidateIf((o) => o.qrCodeUrl !== '' && o.qrCodeUrl !== null && o.qrCodeUrl !== undefined)
  @IsUrl()
  qrCodeUrl?: string;

  @IsNumber()
  @Min(0)
  vipPrice!: number;

  @IsNumber()
  @Min(1)
  vipDurationDays!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// New QRConfig DTO
export class CreateQRConfigDto {
  @IsString()
  @IsNotEmpty()
  bankId!: string;

  @IsString()
  @IsNotEmpty()
  accountNo!: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsString()
  @IsNotEmpty()
  accountName!: string;

  @IsNumber()
  @Min(0)
  monthlyAmount!: number;

  @IsNumber()
  @Min(0)
  yearlyAmount!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateQRConfigDto {
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  accountNo?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  yearlyAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Payment DTOs
export class CreatePaymentDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdatePaymentStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiryDays?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PaymentFilterDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  startDate?: Date;

  @IsOptional()
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class UserFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
