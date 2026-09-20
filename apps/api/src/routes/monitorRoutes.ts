import { Router } from 'express';
import { createMonitorSchema, updateMonitorSchema } from '@pulse/shared';
import * as monitorController from '../controllers/monitorController.js';
import { validate } from '../middlewares/validate.js';

export const monitorRoutes = Router();

monitorRoutes.get('/', monitorController.listMonitors);
monitorRoutes.get('/:id', monitorController.getMonitor);
monitorRoutes.post('/', validate(createMonitorSchema), monitorController.createMonitor);
monitorRoutes.patch('/:id', validate(updateMonitorSchema), monitorController.updateMonitor);
monitorRoutes.delete('/:id', monitorController.deleteMonitor);

monitorRoutes.get('/:id/checks', monitorController.listChecks);
monitorRoutes.post('/:id/check', monitorController.runCheck);

monitorRoutes.post('/:id/pause', monitorController.pauseMonitor);
monitorRoutes.post('/:id/resume', monitorController.resumeMonitor);

monitorRoutes.get('/:id/incidents', monitorController.listIncidents);
