import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'danger';
}

const toneStyles = {
  default: 'text-muted bg-muted/10',
  success: 'text-primary bg-primary-muted',
  danger: 'text-danger bg-danger-muted',
};

export function StatCard({ label, value, icon: Icon, tone = 'default' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneStyles[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
