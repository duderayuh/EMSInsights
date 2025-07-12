import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth-service';
import type { User } from '@shared/schema';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: {
        userId?: number;
        destroy?: (callback?: (err: any) => void) => void;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await authService.getSessionUser(sessionId);
    if (!user) {
      // Clear invalid session cookie
      res.clearCookie('sessionId');
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!authService.isAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!authService.isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
}

export async function requireHospitalAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!authService.isHospitalAdmin(req.user) && !authService.isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Hospital admin access required' });
  }

  next();
}

export async function requireAdminAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!authService.hasAdminAccess(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId) {
    return next();
  }

  authService.getSessionUser(sessionId)
    .then(user => {
      if (user) {
        req.user = user;
      }
      next();
    })
    .catch(() => {
      // Continue without authentication on error
      next();
    });
}