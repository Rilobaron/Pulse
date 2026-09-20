import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CHECK_INTERVALS,
  DEFAULT_TIMEOUT_MS,
  HTTP_METHODS,
  MAX_INTERVAL_MS,
  MAX_TIMEOUT_MS,
  MIN_INTERVAL_MS,
  MIN_TIMEOUT_MS,
  type MonitorDTO,
} from '@pulse/shared';
import { Button } from '@/components/ui/Button';
import { FieldError, Input, Select } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

// Form-level schema: coerces numeric fields coming from <select>/<input> and
// mirrors the shared createMonitorSchema rules (single source of truth on the API).
export const monitorFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  url: z.string().trim().url('Must be a valid URL (including http:// or https://)').max(2048),
  method: z.enum(HTTP_METHODS),
  interval: z.coerce
    .number()
    .int()
    .min(MIN_INTERVAL_MS, 'Interval must be at least 30 seconds')
    .max(MAX_INTERVAL_MS, 'Interval must be at most 10 minutes'),
  timeout: z.coerce
    .number()
    .int()
    .min(MIN_TIMEOUT_MS, 'Timeout must be at least 1 second')
    .max(MAX_TIMEOUT_MS, 'Timeout must be at most 30 seconds'),
});

export type MonitorFormValues = z.infer<typeof monitorFormSchema>;

interface MonitorFormProps {
  /** When provided, the form acts as an edit form pre-filled with these values. */
  monitor?: MonitorDTO;
  onSubmit: (values: MonitorFormValues) => void;
  onCancel: () => void;
  submitting: boolean;
  serverError?: string | null;
  submitLabel?: string;
}

export function MonitorForm({
  monitor,
  onSubmit,
  onCancel,
  submitting,
  serverError,
  submitLabel = 'Save',
}: MonitorFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MonitorFormValues>({
    resolver: zodResolver(monitorFormSchema),
    defaultValues: monitor
      ? {
          name: monitor.name,
          url: monitor.url,
          method: monitor.method,
          interval: monitor.interval,
          timeout: monitor.timeout,
        }
      : { method: 'GET', interval: 60_000, timeout: DEFAULT_TIMEOUT_MS },
  });

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      {serverError && (
        <div className="rounded-lg border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Production API" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </div>

      <div>
        <Label htmlFor="url">URL</Label>
        <Input id="url" placeholder="https://api.example.com/health" {...register('url')} />
        <FieldError message={errors.url?.message} />
        <p className="mt-1.5 text-xs text-muted-dark">
          Only public http(s) endpoints are allowed. Private/internal addresses are blocked.
          {monitor && ' Changing the URL resets the current status until the next check.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div>
          <Label htmlFor="method">HTTP Method</Label>
          <Select id="method" {...register('method')}>
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
          <FieldError message={errors.method?.message} />
        </div>

        <div>
          <Label htmlFor="interval">Check Interval</Label>
          <Select id="interval" {...register('interval')}>
            {CHECK_INTERVALS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <FieldError message={errors.interval?.message} />
        </div>

        <div>
          <Label htmlFor="timeout">Timeout (ms)</Label>
          <Input id="timeout" type="number" min={1000} max={30000} step={500} {...register('timeout')} />
          <FieldError message={errors.timeout?.message} />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-border pt-6">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
