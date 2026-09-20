import { Router } from 'express';
import { listIncidents } from '../controllers/incidentController.js';

export const incidentRoutes = Router();

incidentRoutes.get('/', listIncidents);
