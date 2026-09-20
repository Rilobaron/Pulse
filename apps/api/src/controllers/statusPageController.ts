import type { Request, Response } from 'express';
import type { StatusPageInput } from '@pulse/shared';
import * as statusPageService from '../services/statusPageService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getMyStatusPage = asyncHandler(async (req: Request, res: Response) => {
  const page = await statusPageService.getMyStatusPage(req.userId!);
  res.status(200).json(page);
});

export const upsertStatusPage = asyncHandler(async (req: Request, res: Response) => {
  const page = await statusPageService.upsertStatusPage(req.userId!, req.body as StatusPageInput);
  res.status(200).json(page);
});

/** Public — no authentication required. */
export const getPublicStatusPage = asyncHandler(async (req: Request, res: Response) => {
  const page = await statusPageService.getPublicStatusPage(req.params.slug);
  res.status(200).json(page);
});
