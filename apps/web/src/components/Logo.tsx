import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <Activity className="h-5 w-5 text-black" strokeWidth={2.5} />
      </div>
      <span className="text-lg font-semibold tracking-tight text-foreground">Pulse</span>
    </div>
  );
}
