import { Router } from 'express';
import { listDeliveries } from '../controllers/notificationController.js';

export const notificationDeliveryRoutes = Router();

notificationDeliveryRoutes.get('/', listDeliveries);
