import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string };
    
    // Verify user still exists and is not blocked
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isBlocked: true, role: true },
    });
    
    if (!user || user.isBlocked) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.userId = decoded.userId;
    req.userRole = user.role; // Use fresh role from DB
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    // Never trust the role claim in the JWT — it can be up to 7 days stale.
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true, isBlocked: true },
    });
    if (!user || user.isBlocked) return res.status(403).json({ error: 'Access denied' });
    if (user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
    req.userRole = user.role;
    next();
  } catch {
    return res.status(500).json({ error: 'Erro interno' });
  }
};
