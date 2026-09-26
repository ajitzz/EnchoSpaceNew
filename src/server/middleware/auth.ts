import { Request, Response, NextFunction } from 'express';
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool, rlsStorage } from '../db/connection.js';
import { JWT_SECRET } from '../config/clients.js';
import { resolvePersistedSession } from '../../lib/marketing/legacyAuthorization.js';

export interface AuthRequest extends Request<Record<string, string>> {
  user?: {
    id: number;
    role: string;
    email?: string;
    name?: string;
    phone?: string;
  };
  file?: any;
  files?: any;
  app: express.Application;
}

export const optionalAuthenticateToken = (req: Request & Pick<AuthRequest, 'user'>, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  const guest = () => {
    req.user = undefined;
    rlsStorage.run({ userId: undefined, isRequest: true, bypassRls: false }, () => next());
  };
  if (!token) return guest();
  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, async (err: any, claims: any) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    try {
      const user = await resolvePersistedSession(pool, claims);
      req.user = user;
      rlsStorage.run({ userId: user.id, isRequest: true, bypassRls: user.role === 'admin' }, () => next());
    } catch {
      return res.status(401).json({ error: 'Account session is no longer available.' });
    }
  });
};

export const authenticateToken = (req: Request & Pick<AuthRequest, 'user'>, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required. No token provided.' });
  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, async (err: any, claims: any) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    try {
      const user = await resolvePersistedSession(pool, claims);
      req.user = user;
      rlsStorage.run({ userId: user.id, isRequest: true, bypassRls: user.role === 'admin' }, () => next());
    } catch (error: any) {
      return res.status(error?.status === 401 ? 401 : 503).json({ error: 'Account session verification is unavailable.' });
    }
  });
};

export const requireAdmin = (req: Request & Pick<AuthRequest, 'user'>, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};

export const requireExplicitDevelopmentFixture = (_req: Request, res: Response, next: NextFunction) => {
  const productionRuntime = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (productionRuntime || process.env.ENCHO_ALLOW_DEVELOPMENT_FIXTURES !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many OTP requests, please try again later' }
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5000 : 100000,
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip.includes('127.0.0.1') || process.env.NODE_ENV !== 'production';
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many requests, please try again later.' }
});

export const aiGatekeeperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  skip: (req: any) => req.user?.role === 'admin',
  keyGenerator: (req) => {
    return (req as any).user?.id ? `ai_limit_user_${(req as any).user.id}` : req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Strict AI Limit Exceeded: Maximum 30 campaign evaluations allowed per hour.' }
});

export const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many bookings created from this IP, please try again after an hour.' }
});

export const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Message rate limit exceeded. Please wait before sending more.' }
});

export const cacheControl = (maxAgeSeconds: number) => {
  return (req: any, res: any, next: any) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    }
    next();
  };
};
