import { Router } from 'express';
import {
  notificationChannelSchema,
  updateNotificationChannelSchema,
} from '@pulse/shared';
import * as notificationController from '../controllers/notificationController.js';
import { validate } from '../middlewares/validate.js';

export const notificationChannelRoutes = Router();

notificationChannelRoutes.get('/', notificationController.listChannels);
notificationChannelRoutes.post('/', validate(notificationChannelSchema), notificationController.createChannel);
notificationChannelRoutes.patch(
  '/:id',
  validate(updateNotificationChannelSchema),
  notificationController.updateChannel,
);
notificationChannelRoutes.delete('/:id', notificationController.deleteChannel);
notificationChannelRoutes.post('/:id/test', notificationController.testChannel);
