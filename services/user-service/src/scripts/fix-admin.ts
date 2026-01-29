import mongoose from 'mongoose';

async function fixAdmin() {
  await mongoose.connect('mongodb://localhost:27017/tradex');

  const db = mongoose.connection.db!;

  const result = await db.collection('users').updateOne(
    { email: 'admin@tradex.com' },
    {
      $set: {
        role: 'admin',
        vipStatus: 'ACTIVE',
      },
    },
  );

  console.log('Updated:', result.modifiedCount);

  const user = await db
    .collection('users')
    .findOne({ email: 'admin@tradex.com' });
  console.log('Admin user:', JSON.stringify(user, null, 2));

  await mongoose.disconnect();
}

fixAdmin();
