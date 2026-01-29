export enum UserRole {
  USER = 'user',
  VIP = 'vip',
  ADMIN = 'admin',
}

export enum VipStatus {
  NONE = 'NONE',
  PENDING = 'PENDING', // Đã thanh toán, chờ Admin duyệt
  ACTIVE = 'ACTIVE', // Đã duyệt, đang là VIP
  EXPIRED = 'EXPIRED', // Hết hạn
}

export enum VipPlan {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export interface IUser {
  _id?: string;
  username: string;
  email: string;
  password: string;
  name?: string;
  role: UserRole;
  vipStatus?: VipStatus;
  vipPlan?: VipPlan;
  vipExpiry?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface IUserPublic {
  _id: string;
  username: string;
  email: string;
  name?: string;
  role: UserRole;
  vipExpiry?: Date;
  createdAt: Date;
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface IJwtPayload {
  userId: string; // user id
  username?: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
