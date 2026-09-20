import { Router } from 'express';
import { statusPageSchema } from '@pulse/shared';
import * as statusPageController from '../controllers/statusPageController.js';
import { validate } from '../middlewares/validate.js';

export const statusPageRoutes = Router();

statusPageRoutes.get('/', statusPageController.getMyStatusPage);
statusPageRoutes.put('/', validate(statusPageSchema), statusPageController.upsertStatusPage);
