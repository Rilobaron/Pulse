import type { MonitorStatus } from '@pulse/shared';
import { Badge } from '@/components/ui/Badge';

interface StatusBadgeProps {
  status: MonitorStatus;
  isPaused?: boolean;
}

const statusConfig: Record<MonitorStatus, { label: string; variant: 'success' | 'danger' | 'muted' }> = {
  UP: { label: 'Operational', variant: 'success' },
  DOWN: { label: 'Down', variant: 'danger' },
  UNKNOWN: { label: 'Unknown', variant: 'muted' },
};

export function StatusBadge({ status, isPaused = false }: StatusBadgeProps) {
  if (isPaused) {
    return (
      <Badge variant="warning" dot>
        Paused
      </Badge>
    );
  }
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}

