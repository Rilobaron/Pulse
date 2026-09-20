import { Router } from 'express';
import { getPublicStatusPage } from '../controllers/statusPageController.js';

/**
 * Public routes — intentionally NOT protected by the auth middleware.
 * Must only expose data that is safe for anonymous consumption.
 */
export const publicRoutes = Router();

publicRoutes.get('/status-pages/:slug', getPublicStatusPage);
