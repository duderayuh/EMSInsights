// Script to migrate existing admin users to super_admin role
import { db } from './server/db';
import { users } from './shared/schema';
import { eq, or } from 'drizzle-orm';
import { config } from 'dotenv';

config();

async function migrateRoles() {
  console.log('Starting role migration...');
  
  try {
    // Update existing admin users to super_admin
    const adminResult = await db
      .update(users)
      .set({ role: 'super_admin' })
      .where(eq(users.role, 'admin'))
      .returning();
    
    console.log(`Updated ${adminResult.length} admin users to super_admin`);
    
    // Ensure admin and dudrea users have super_admin role
    const superAdminResult = await db
      .update(users)
      .set({ role: 'super_admin' })
      .where(or(
        eq(users.username, 'admin'),
        eq(users.username, 'dudrea')
      ))
      .returning();
    
    console.log(`Ensured admin and dudrea users have super_admin role`);
    
    // Display all users and their roles
    const allUsers = await db.select().from(users);
    console.log('\nCurrent users and roles:');
    allUsers.forEach(user => {
      console.log(`- ${user.username}: ${user.role}`);
    });
    
    console.log('\nRole migration completed successfully!');
  } catch (error) {
    console.error('Error during role migration:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

migrateRoles();