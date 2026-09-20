import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { monitorRoutes } from './monitorRoutes.js';
import { statsRoutes } from './statsRoutes.js';
import { incidentRoutes } from './incidentRoutes.js';
import { statusPageRoutes } from './statusPageRoutes.js';
import { publicRoutes } from './publicRoutes.js';
import { authenticate } from '../middlewares/auth.js';

export const apiRoutes = Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/public', publicRoutes); // intentionally unauthenticated
apiRoutes.use('/monitors', authenticate, monitorRoutes);
apiRoutes.use('/incidents', authenticate, incidentRoutes);
apiRoutes.use('/status-page', authenticate, statusPageRoutes);
apiRoutes.use('/stats', authenticate, statsRoutes);
