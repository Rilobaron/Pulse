import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail, Pencil, Plus, Trash2, Webhook, MessageSquare, Send } from 'lucide-react';
import type {
  NotificationChannelDTO,
  NotificationChannelInput,
  NotificationChannelType,
} from '@pulse/shared';
import { ApiError, api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FieldError, Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

const TYPE_LABEL: Record<NotificationChannelType, string> = {
  DISCORD: 'Discord',
  WEBHOOK: 'Webhook',
  EMAIL: 'Email',
};

const TYPE_ICON: Record<NotificationChannelType, typeof Bell> = {
  DISCORD: MessageSquare,
  WEBHOOK: Webhook,
  EMAIL: Mail,
};
interface ChannelFormProps {
  channel?: NotificationChannelDTO | null;
  onSubmit: (input: NotificationChannelInput) => void;
  onCancel: () => void;
  submitting: boolean;
  serverError?: string | null;
}

function ChannelForm({ channel, onSubmit, onCancel, submitting, serverError }: ChannelFormProps) {
  const [type, setType] = useState<NotificationChannelType>(channel?.type ?? 'DISCORD');
  const [name, setName] = useState(channel?.name ?? '');
  const [target, setTarget] = useState('');
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [regenerateSecret, setRegenerateSecret] = useState(false);

  const targetLabel = type === 'EMAIL' ? 'Email address' : type === 'DISCORD' ? 'Discord webhook URL' : 'Webhook URL';
  const targetPlaceholder =
    type === 'EMAIL'
      ? 'ops@example.com'
      : type === 'DISCORD'
        ? 'https://discord.com/api/webhooks/...'
        : 'https://hooks.example.com/pulse';

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmit({ name, type, enabled, target, ...(type === 'WEBHOOK' ? { regenerateSecret } : {}) }); }} noValidate>
      {serverError && (
        <div className="rounded-lg border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div>
        <Label htmlFor="ch-type">Type</Label>
        <select
          id="ch-type"
          value={type}
          disabled={Boolean(channel)}
          onChange={(e) => setType(e.target.value as NotificationChannelType)}
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        >
          <option value="DISCORD">Discord</option>
          <option value="WEBHOOK">Webhook</option>
          <option value="EMAIL">Email</option>
        </select>
 {channel && <p className="mt-1.5 text-xs text-muted-dark">Type cannot be changed after creation.</p>}
      </div>

      <div>
        <Label htmlFor="ch-name">Name</Label>
        <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Discord Production" />
      </div>

      <div>
        <Label htmlFor="ch-target">{targetLabel}</Label>
        <Input
          id="ch-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={targetPlaceholder}
          className={type === 'EMAIL' ? '' : 'font-mono text-xs'}
        />
        <FieldError message={serverError && serverError.includes('Target') ? serverError : undefined} />
        {type === 'WEBHOOK' && (
          <p className="mt-1.5 text-xs text-muted-dark">
            Internal/private addresses are blocked. A signing secret is generated automatically — keep it
            to verify the <span className="font-mono">X-Pulse-Signature</span> header.
          </p>
        )}
      </div>

      {channel?.type === 'WEBHOOK' && (
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Rotate signing secret</p>
            <p className="text-xs text-muted">Generates a new secret. The old one stops working.</p>
          </div>
          <Switch checked={regenerateSecret} onCheckedChange={setRegenerateSecret} aria-label="Rotate secret" />
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">Enabled</p>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Channel enabled" />
      </div>

      <div className="flex justify-end gap-3 border-t border-border pt-5">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {channel ? 'Save changes' : 'Create channel'}
        </Button>
      </div>
    </form>
  );
}
export default function NotificationsSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationChannelDTO | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<NotificationChannelDTO | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['notification-channels'],
    queryFn: api.notificationChannels.list,
  });

  const deliveriesQuery = useQuery({
    queryKey: ['notification-deliveries'],
    queryFn: () => api.notifications.deliveries({}),
    refetchInterval: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    void queryClient.invalidateQueries({ queryKey: ['notification-deliveries'] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: NotificationChannelInput) =>
      editing ? api.notificationChannels.update(editing.id, input) : api.notificationChannels.create(input),
    onSuccess: (result, input) => {
      invalidate();
      setDrawerOpen(false);
      setEditing(null);
      setFormError(null);
      toast(editing ? 'Channel updated' : `"${input.name}" created`);
      if ('webhookSecret' in result && result.webhookSecret) {
        setSecretOnce(result.webhookSecret);
      }
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Could not save the channel'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.notificationChannels.remove(id),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      toast('Channel deleted');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not delete', 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: (channel: NotificationChannelDTO) =>
      api.notificationChannels.update(channel.id, { enabled: !channel.enabled }),
    onSuccess: () => {
      invalidate();
      toast('Channel updated');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Action failed', 'error'),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.notificationChannels.test(id),
    onSuccess: (delivery) => {
      invalidate();
      toast('Test notification queued — check the delivery status below');
      if (delivery.status === 'FAILED') {
        toast(delivery.lastError ?? 'Delivery failed', 'error');
      }
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not queue test', 'error'),
  });

  const channels = channelsQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notification Channels</h1>
          <p className="mt-1 text-sm text-muted">
            Where Pulse sends incident alerts — Discord, generic webhooks and email
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setDrawerOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Channel
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {channelsQuery.isLoading ? (
            <TableSkeleton rows={3} />
          ) : channels.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No channels yet"
              description="Create a Discord, webhook or email channel to get alerted when a monitor goes down."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {channels.map((channel) => {
                const Icon = TYPE_ICON[channel.type];
                return (
                  <li key={channel.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card-hover">
                        <Icon className="h-4 w-4 text-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{channel.name}</p>
                        <p className="truncate font-mono text-xs text-muted-dark">{channel.maskedTarget}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={channel.enabled ? 'success' : 'muted'} dot>
                        {channel.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <span className="hidden text-xs text-muted-dark sm:inline">{TYPE_LABEL[channel.type]}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testMutation.mutate(channel.id)}
                        loading={testMutation.isPending && testMutation.variables === channel.id}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Test
                      </Button>
                      <button
                        className="rounded-lg p-2 text-muted-dark hover:bg-card-hover hover:text-foreground"
                        aria-label={`Edit ${channel.name}`}
                        onClick={() => {
                          setEditing(channel);
                          setFormError(null);
                          setDrawerOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-lg p-2 text-muted-dark hover:bg-danger-muted hover:text-danger"
                        aria-label={`Delete ${channel.name}`}
                        onClick={() => setToDelete(channel)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Switch
                        checked={channel.enabled}
                        onCheckedChange={() => toggleMutation.mutate(channel)}
                        aria-label={`Toggle ${channel.name}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* Delivery history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-foreground">Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {deliveries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted">No notifications sent yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {deliveries.map((delivery) => (
                <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {delivery.eventType === 'MONITOR_TEST'
                        ? 'Test notification'
                        : `Incident ${delivery.eventType === 'INCIDENT_OPENED' ? 'opened' : 'resolved'}`}
                      <span className="text-muted"> · {delivery.monitorName}</span>
                    </p>
                    <p className="truncate text-xs text-muted-dark">
                      {delivery.channelName} · {formatRelativeTime(delivery.createdAt)}
                      {delivery.lastError ? ` · ${delivery.lastError}` : ''}
                    </p>
                  </div>
                  <Badge
                    variant={delivery.status === 'SENT' ? 'success' : delivery.status === 'FAILED' ? 'danger' : 'muted'}
                    dot
                  >
                    {delivery.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${editing.name}` : 'Add channel'}
      >
        <ChannelForm
          channel={editing}
          onSubmit={(input) => saveMutation.mutate(input)}
          onCancel={() => {
            setDrawerOpen(false);
            setEditing(null);
          }}
          submitting={saveMutation.isPending}
          serverError={formError}
        />
      </Drawer>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete "${toDelete?.name}"?`}
        description="Monitors using this channel will stop notifying through it. This cannot be undone."
        loading={deleteMutation.isPending}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />

      {/* Signing secret shown exactly once */}
      <Drawer open={secretOnce !== null} onClose={() => setSecretOnce(null)} title="Webhook signing secret">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Copy this secret now — it is shown <strong className="text-foreground">only once</strong>. Use it to
            verify the <span className="font-mono">X-Pulse-Signature</span> header of incoming webhooks.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-xs text-primary">
            {secretOnce}
          </pre>
          <Button className="w-full" onClick={() => setSecretOnce(null)}>
            I saved it
          </Button>
        </div>
      </Drawer>
    </div>
  );
}


