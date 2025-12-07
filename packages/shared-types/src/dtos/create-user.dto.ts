export class CreateUserDto {
  email!: string;
  password!: string;
  username!: string;
  name?: string;
  role?: 'user' | 'vip' | 'admin';
  phone?: string;
  address?: string;
}
