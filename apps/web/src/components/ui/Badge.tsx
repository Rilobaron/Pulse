import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'muted';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-muted/10 text-muted border-border',
  success: 'bg-primary-muted text-primary border-primary/20',
  danger: 'bg-danger-muted text-danger border-danger/20',
  warning: 'bg-warning-muted text-warning border-warning/20',
  muted: 'bg-muted/10 text-muted-dark border-border',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ variant = 'default', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
