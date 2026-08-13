import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../logger/index';

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err, `[${req.method}] ${req.path}`);
    } else {
      logger.warn(err, `[${req.method}] ${req.path}`);
    }
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      details: err.details,
    });
  }

  // Handle unexpected errors
  logger.error(err, `Unhandled Error: [${req.method}] ${req.path}`);
  return res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};
