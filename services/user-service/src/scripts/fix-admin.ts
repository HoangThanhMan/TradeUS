import mongoose from 'mongoose';

async function fixAdmin() {
  // Use connection string from .env
  const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/tradex?authSource=admin';
  
  await mongoose.connect(mongoUri);

  const db = mongoose.connection.db!;

  const existingAdmin = await db.collection('users').findOne({
    $or: [
      { username: 'admin' },
      { email: { $regex: /admin/i } }
    ]
  });

  if (existingAdmin) {
    console.log('Found existing admin user:', existingAdmin.email);
    
    // Update role to admin
    const result = await db.collection('users').updateOne(
      { _id: existingAdmin._id },
      {
        $set: {
          role: 'admin',
          vipStatus: 'ACTIVE',
        },
      },
    );

    console.log('Updated:', result.modifiedCount);
  } else {
    console.log('No admin user found. Creating new one...');
    
    // Tạo admin mới với bcrypt hash cho password "Admin@123456"
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash('Admin@123456', 10);
    
    await db.collection('users').insertOne({
      username: 'superadmin',
      email: 'admin@tradex.com',
      password: hashedPassword,
      name: 'System Administrator',
      role: 'admin',
      vipStatus: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    console.log('Created new admin user:');
    console.log('Email: admin@tradex.com');
    console.log('Password: Admin@123456');
  }

  const user = await db.collection('users').findOne({
    $or: [
      { username: 'admin' },
      { username: 'superadmin' },
      { email: 'admin@tradex.com' }
    ]
  });
  console.log('Admin user:', JSON.stringify(user, null, 2));

  await mongoose.disconnect();
}

fixAdmin();
