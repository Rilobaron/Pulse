import type { Request, Response } from 'express';
import type { CreateMonitorInput, UpdateMonitorInput } from '@pulse/shared';
import * as monitorService from '../services/monitorService.js';
import * as monitorCheckService from '../services/monitorCheckService.js';
import * as incidentService from '../services/incidentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listMonitors = asyncHandler(async (req: Request, res: Response) => {
  const monitors = await monitorService.listMonitors(req.userId!);
  res.status(200).json(monitors);
});

export const getMonitor = asyncHandler(async (req: Request, res: Response) => {
  const monitor = await monitorService.getMonitor(req.userId!, req.params.id);
  res.status(200).json(monitor);
});

export const createMonitor = asyncHandler(async (req: Request, res: Response) => {
  const monitor = await monitorService.createMonitor(req.userId!, req.body as CreateMonitorInput);
  res.status(201).json(monitor);
});

export const updateMonitor = asyncHandler(async (req: Request, res: Response) => {
  const monitor = await monitorService.updateMonitor(
    req.userId!,
    req.params.id,
    req.body as UpdateMonitorInput,
  );
  res.status(200).json(monitor);
});

export const deleteMonitor = asyncHandler(async (req: Request, res: Response) => {
  await monitorService.deleteMonitor(req.userId!, req.params.id);
  res.status(204).send();
});

export const listChecks = asyncHandler(async (req: Request, res: Response) => {
  const checks = await monitorCheckService.listChecks(req.userId!, req.params.id);
  res.status(200).json(checks);
});

export const runCheck = asyncHandler(async (req: Request, res: Response) => {
  const check = await monitorCheckService.runManualCheck(req.userId!, req.params.id);
  res.status(201).json(check);
});

export const pauseMonitor = asyncHandler(async (req: Request, res: Response) => {
  const monitor = await monitorService.pauseMonitor(req.userId!, req.params.id);
  res.status(200).json(monitor);
});

export const resumeMonitor = asyncHandler(async (req: Request, res: Response) => {
  const monitor = await monitorService.resumeMonitor(req.userId!, req.params.id);
  res.status(200).json(monitor);
});

export const listIncidents = asyncHandler(async (req: Request, res: Response) => {
  const incidents = await incidentService.listIncidentsForMonitor(req.userId!, req.params.id);
  res.status(200).json(incidents);
});
