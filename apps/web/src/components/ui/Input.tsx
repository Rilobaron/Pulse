import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const baseFieldStyles =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-dark transition-colors ' +
  'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseFieldStyles, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(baseFieldStyles, 'appearance-none', className)} {...props} />
  ),
);
Select.displayName = 'Select';

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-danger">{message}</p>;
}
