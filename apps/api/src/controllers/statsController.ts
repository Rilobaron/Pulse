import type { Request, Response } from 'express';
import { getDashboardStats } from '../services/statsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await getDashboardStats(req.userId!);
  res.status(200).json(stats);
});
