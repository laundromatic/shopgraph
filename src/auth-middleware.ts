import type { Request, Response, NextFunction } from 'express';
import type { Redis } from '@upstash/redis';
import type { Customer } from './types.js';
import { lookupApiKey } from './api-keys.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      customer?: Customer;
    }
  }
}

export function createAuthMiddleware(redis: Redis | null) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!redis) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer sg_live_')) return next();

    const apiKey = authHeader.slice(7); // Remove "Bearer "
    try {
      const customer = await lookupApiKey(redis, apiKey);
      if (customer) {
        req.customer = customer;
      }
      // Don't reject invalid keys here — let route handlers decide
      // (an invalid key with a payment_method_id should still work via MPP)
    } catch {
      // Redis error — don't block the request, fall through to other auth methods
    }
    next();
  };
}
