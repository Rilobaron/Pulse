import { Router } from 'express';
import * as statsController from '../controllers/statsController.js';

export const statsRoutes = Router();

statsRoutes.get('/dashboard', statsController.dashboardStats);
