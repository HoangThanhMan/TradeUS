import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole, VipStatus } from '@tradex/shared-types';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const usersService = app.get(UsersService);
  
  const adminEmail = 'admin@tradex.com';
  const adminPassword = 'Admin@123456';
  const adminUsername = 'admin';
  
  try {
    // Check if admin exists
    const existingAdmin = await usersService.findByEmail(adminEmail).catch(() => null);
    
    if (existingAdmin) {
      console.log('Admin user already exists');
    } else {
      // Create admin user
      const admin = await usersService.create({
        email: adminEmail,
        password: adminPassword,
        username: adminUsername,
        name: 'System Administrator',
      });
      
      // Update role to ADMIN
      await usersService.updateRole(admin._id as string, UserRole.ADMIN);
      
      console.log('Admin user created successfully!');
      console.log('Email:', adminEmail);
      console.log('Password:', adminPassword);
    }
  } catch (error) {
    console.error('Error seeding admin:', error);
  }
  
  await app.close();
}

seedAdmin();