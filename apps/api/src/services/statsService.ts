import { Types } from 'mongoose';
import type { DashboardStats } from '@pulse/shared';
import { Monitor } from '../models/Monitor.js';
import { MonitorCheck } from '../models/MonitorCheck.js';
import { Incident } from '../models/Incident.js';

/**
 * Aggregated stats for the authenticated user's dashboard.
 * Average response time considers checks from the last 24 hours.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const ownerId = new Types.ObjectId(userId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [statusAgg] = await Monitor.aggregate<{
    total: number;
    up: number;
    down: number;
    unknown: number;
    paused: number;
  }>([
    { $match: { userId: ownerId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        up: { $sum: { $cond: [{ $eq: ['$status', 'UP'] }, 1, 0] } },
        down: { $sum: { $cond: [{ $eq: ['$status', 'DOWN'] }, 1, 0] } },
        unknown: { $sum: { $cond: [{ $eq: ['$status', 'UNKNOWN'] }, 1, 0] } },
        paused: { $sum: { $cond: ['$isPaused', 1, 0] } },
      },
    },
  ]);

  const [responseAgg] = await MonitorCheck.aggregate<{ avg: number }>([
    {
      $lookup: {
        from: 'monitors',
        localField: 'monitorId',
        foreignField: '_id',
        as: 'monitor',
      },
    },
    { $unwind: '$monitor' },
    { $match: { 'monitor.userId': ownerId, checkedAt: { $gte: since }, status: 'UP' } },
    { $group: { _id: null, avg: { $avg: '$responseTime' } } },
  ]);

  const activeIncidents = await Incident.countDocuments({ userId: ownerId, status: 'OPEN' });

  return {
    total: statusAgg?.total ?? 0,
    up: statusAgg?.up ?? 0,
    down: statusAgg?.down ?? 0,
    unknown: statusAgg?.unknown ?? 0,
    paused: statusAgg?.paused ?? 0,
    activeIncidents,
    avgResponseTime: responseAgg ? Math.round(responseAgg.avg) : null,
  };
}
