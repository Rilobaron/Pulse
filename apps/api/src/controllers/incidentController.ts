import type { Request, Response } from 'express';
import * as incidentService from '../services/incidentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listIncidents = asyncHandler(async (req: Request, res: Response) => {
  const incidents = await incidentService.listIncidentsForUser(req.userId!);
  res.status(200).json(incidents);
});
