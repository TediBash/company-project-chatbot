import bcrypt from 'bcrypt';
import { query } from './src/config/db.js';

const seedRealHashes = async () => {
  try {
    const plainPassword = 'admin123';
    const saltRounds = 10;
    
    console.log(`Generating Bcrypt hash for: "${plainPassword}"...`);
    const realHash = await bcrypt.hash(plainPassword, saltRounds);
    
    console.log(`Updating all users in database with the new hash...`);
    await query('UPDATE app_tenant.users SET password_hash = $1', [realHash]);
    
    console.log('✅ Success! All users can now log in with the password: admin123');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating passwords:', error);
    process.exit(1);
  }
};

seedRealHashes();