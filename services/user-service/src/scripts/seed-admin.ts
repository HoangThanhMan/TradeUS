// npx ts-node src/scripts/seed-admin.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole, VipStatus } from '@tradex/shared-types';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const usersService = app.get(UsersService);
  
  const adminEmail = 'admin@tradex.com';
  const adminPassword = 'Admin@123456';
  const adminUsername = 'superadmin';
  
  try {
    // Check if admin exists
    const existingAdmin = await usersService.findByEmail(adminEmail).catch(() => null);
    
    if (existingAdmin) {
      console.log('Admin user already exists:', adminEmail);
      // Update role to ADMIN if not already
      const userId = (existingAdmin as any)._id?.toString() || (existingAdmin as any).id;
      if (userId) {
        await usersService.updateRole(userId, UserRole.ADMIN);
        console.log('Updated role to ADMIN');
      }
    } else {
      // Create admin user
      const admin = await usersService.create({
        email: adminEmail,
        password: adminPassword,
        username: adminUsername,
        name: 'System Administrator',
      });
      
      // Get the user ID from the created user - try multiple ways
      const userId = (admin as any)._id?.toString() || (admin as any).id?.toString();
      console.log('Created admin object:', JSON.stringify(admin, null, 2));
      
      if (userId) {
        // Update role to ADMIN
        await usersService.updateRole(userId, UserRole.ADMIN);
        console.log('Admin user created successfully!');
        console.log('Email:', adminEmail);
        console.log('Password:', adminPassword);
      } else {
        console.log('Admin created but could not get ID to update role.');
        console.log('Please manually update role in database.');
      }
    }
  } catch (error) {
    console.error('Error seeding admin:', error);
  }
  
  await app.close();
}

seedAdmin();