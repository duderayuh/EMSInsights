import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, sessions } from '@shared/schema';
import type { User, Session, LoginCredentials, InsertUser } from '@shared/schema';

export class AuthService {
  private readonly SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  async createUser(userData: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        password: hashedPassword,
      })
      .returning();

    return user;
  }

  async verifyUser(credentials: LoginCredentials): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, credentials.username))
      .limit(1);

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    return user;
  }

  async createSession(userId: number): Promise<Session> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION);

    const [session] = await db
      .insert(sessions)
      .values({
        id: sessionId,
        userId,
        expiresAt,
      })
      .returning();

    return session;
  }

  async getSessionUser(sessionId: string): Promise<User | null> {
    const [session] = await db
      .select({
        user: users,
        session: sessions,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session || session.session.expiresAt < new Date() || !session.user.isActive) {
      if (session) {
        // Clean up expired session
        await this.deleteSession(sessionId);
      }
      return null;
    }

    return session.user;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async deleteUserSessions(userId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async isSuperAdmin(user: User): boolean {
    return user.role === 'super_admin';
  }

  async isHospitalAdmin(user: User): boolean {
    return user.role === 'hospital_admin';
  }

  async hasAdminAccess(user: User): boolean {
    return user.role === 'admin' || user.role === 'super_admin' || user.role === 'hospital_admin';
  }

  async isAdmin(user: User): boolean {
    // Legacy method for backward compatibility - supports both old 'admin' and new 'super_admin'
    return user.role === 'admin' || user.role === 'super_admin';
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.username);
  }

  async getUserById(id: number): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user || null;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | null> {
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 12);
    }

    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return user || null;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return result.rowCount > 0;
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
    // Get the user's current password
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return false;
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return false;
    }

    // Hash new password and update
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    await db
      .update(users)
      .set({ 
        password: hashedNewPassword,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));

    return true;
  }
}

export const authService = new AuthService();