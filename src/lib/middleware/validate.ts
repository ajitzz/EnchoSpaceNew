import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/AppError';

export const validateRequest = (schema: any) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: any) {
      if (error && error.errors) {
        const errors = error.errors.map((e: any) => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        return next(new ValidationError('Validation failed', errors));
      }
      return next(error);
    }
  };
};
