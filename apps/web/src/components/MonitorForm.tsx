import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown } from 'lucide-react';
import {
  CHECK_INTERVALS,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RECOVERY_THRESHOLD,
  DEFAULT_TIMEOUT_MS,
  HTTP_METHODS,
  MAX_INTERVAL_MS,
  MAX_THRESHOLD,
  MAX_TIMEOUT_MS,
  MIN_INTERVAL_MS,
  MIN_THRESHOLD,
  MIN_TIMEOUT_MS,
  type NotificationChannelDTO,
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
  failureThreshold: z.coerce
    .number()
    .int()
    .min(MIN_THRESHOLD, 'Failure threshold must be at least 1')
    .max(MAX_THRESHOLD, 'Failure threshold must be at most 10'),
  recoveryThreshold: z.coerce
    .number()
    .int()
    .min(MIN_THRESHOLD, 'Recovery threshold must be at least 1')
    .max(MAX_THRESHOLD, 'Recovery threshold must be at most 10'),
  notificationChannelIds: z.array(z.string()).default([]),
});

export type MonitorFormValues = z.infer<typeof monitorFormSchema>;

interface MonitorFormProps {
  /** When provided, the form acts as an edit form pre-filled with these values. */
  monitor?: MonitorDTO;
  /** Enabled notification channels available for assignment. */
  channels?: NotificationChannelDTO[];
  onSubmit: (values: MonitorFormValues) => void;
  onCancel: () => void;
  submitting: boolean;
  serverError?: string | null;
  submitLabel?: string;
}

export function MonitorForm({
  monitor,
  channels = [],
  onSubmit,
  onCancel,
  submitting,
  serverError,
  submitLabel = 'Save',
}: MonitorFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    monitor?.notificationChannelIds ?? [],
  );

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
          failureThreshold: monitor.failureThreshold,
          recoveryThreshold: monitor.recoveryThreshold,
          notificationChannelIds: monitor.notificationChannelIds,
        }
      : {
          method: 'GET',
          interval: 60_000,
          timeout: DEFAULT_TIMEOUT_MS,
          failureThreshold: DEFAULT_FAILURE_THRESHOLD,
          recoveryThreshold: DEFAULT_RECOVERY_THRESHOLD,
          notificationChannelIds: [],
        },
  });

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
  };

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit((values) => onSubmit({ ...values, notificationChannelIds: selectedChannels }))}
      noValidate
    >
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

      {/* Advanced Monitoring — collapsible to keep the main form clean */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
        >
          <span>Advanced Monitoring</span>
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {advancedOpen && (
          <div className="space-y-5 border-t border-border px-4 py-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="failureThreshold">Failure threshold</Label>
                <Input id="failureThreshold" type="number" min={1} max={10} {...register('failureThreshold')} />
                <FieldError message={errors.failureThreshold?.message} />
                <p className="mt-1.5 text-xs text-muted-dark">
                  Number of consecutive failed checks before marking the monitor as Down.
                </p>
              </div>

              <div>
                <Label htmlFor="recoveryThreshold">Recovery threshold</Label>
                <Input id="recoveryThreshold" type="number" min={1} max={10} {...register('recoveryThreshold')} />
                <FieldError message={errors.recoveryThreshold?.message} />
                <p className="mt-1.5 text-xs text-muted-dark">
                  Number of consecutive successful checks before resolving an outage.
                </p>
              </div>
            </div>

            <div>
              <Label>Notifications</Label>
              {channels.length === 0 ? (
                <p className="text-xs text-muted-dark">
                  No notification channels configured yet. Create one under Settings → Notifications.
                </p>
              ) : (
                <ul className="space-y-2">
                  {channels.map((channel) => (
                    <li
                      key={channel.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{channel.name}</p>
                        <p className="truncate font-mono text-xs text-muted-dark">{channel.maskedTarget}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(channel.id)}
                        onChange={() => toggleChannel(channel.id)}
                        className="h-4 w-4 accent-[#10b981]"
                        aria-label={`Notify ${channel.name}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-muted-dark">
                A monitor without channels keeps working normally — it just does not notify anyone.
              </p>
            </div>
          </div>
        )}
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
