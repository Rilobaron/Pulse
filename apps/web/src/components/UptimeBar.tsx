import { cn } from '@/lib/utils';

interface UptimeBarProps {
  /** Daily buckets, oldest first. uptime null = no data. */
  days: Array<{ date: string; uptime: number | null }>;
}

function barColor(uptime: number | null): string {
  if (uptime === null) return 'bg-border/50';
  if (uptime >= 99) return 'bg-primary';
  if (uptime >= 95) return 'bg-warning';
  return 'bg-danger';
}

export function UptimeBar({ days }: UptimeBarProps) {
  return (
    <div className="flex items-end gap-[2px]" aria-label="Daily uptime">
      {days.map((day) => (
        <div
          key={day.date}
          title={`${day.date}: ${day.uptime === null ? 'no data' : `${day.uptime.toFixed(2)}%`}`}
          className={cn('h-8 flex-1 rounded-sm transition-colors', barColor(day.uptime))}
        />
      ))}
    </div>
  );
}
