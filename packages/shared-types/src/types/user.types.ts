export enum UserRole {
  USER = 'user',
  VIP = 'vip',
  ADMIN = 'admin',
}

export interface IUser {
  _id?: string;
  username: string;
  email: string;
  password: string;
  name?: string;
  role: UserRole;
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
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
