import type { Request, Response } from 'express';
import type { NotificationChannelInput, UpdateNotificationChannelInput } from '@pulse/shared';
import * as notificationService from '../services/notificationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listChannels = asyncHandler(async (req: Request, res: Response) => {
  const channels = await notificationService.listChannels(req.userId!);
  res.status(200).json(channels);
});

export const createChannel = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationService.createChannel(req.userId!, req.body as NotificationChannelInput);
  // `webhookSecret` is returned exactly once — on creation.
  res.status(201).json({
    channel: result.channel,
    ...(result.webhookSecret ? { webhookSecret: result.webhookSecret } : {}),
  });
});

export const updateChannel = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationService.updateChannel(
    req.userId!,
    req.params.id,
    req.body as UpdateNotificationChannelInput,
  );
  res.status(200).json({
    channel: result.channel,
    ...(result.webhookSecret ? { webhookSecret: result.webhookSecret } : {}),
  });
});

export const deleteChannel = asyncHandler(async (req: Request, res: Response) => {
  await notificationService.deleteChannel(req.userId!, req.params.id);
  res.status(204).send();
});

/** Test notifications go through the same queue/worker pipeline as real alerts. */
export const testChannel = asyncHandler(async (req: Request, res: Response) => {
  const delivery = await notificationService.createTestDelivery(req.userId!, req.params.id);
  res.status(202).json(delivery);
});

export const listDeliveries = asyncHandler(async (req: Request, res: Response) => {
  const { monitorId, status, limit } = req.query;

  const deliveries = await notificationService.listDeliveries(req.userId!, {
    monitorId: typeof monitorId === 'string' ? monitorId : undefined,
    status:
      status === 'PENDING' || status === 'SENT' || status === 'FAILED' ? status : undefined,
    limit: typeof limit === 'string' ? Number(limit) : undefined,
  });

  res.status(200).json(deliveries);
});

export const emailStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(notificationService.getEmailStatus());
});
