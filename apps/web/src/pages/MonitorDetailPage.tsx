import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Gauge,
  Pencil,
  Pause,
  Play,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonitorDTO } from '@pulse/shared';
import { ApiError, api } from '@/lib/api';
import {
  cn,
  formatDateTime,
  formatDuration,
  formatMs,
  formatPercent,
  formatRelativeTime,
} from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { PageSpinner } from '@/components/ui/Spinner';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { MonitorForm } from '@/components/MonitorForm';
import { type MonitorFormValues } from '@/lib/monitorForm';
import { useToast } from '@/components/ui/toast-context';
import { useNow } from '@/lib/useNow';

type Range = '24h' | '7d' | '30d';
const RANGE_MS: Record<Range, number> = {
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
};
export default function MonitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [range, setRange] = useState<Range>('24h');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-render every 30s so "Last Check: 4 minutes ago" advances without
  // refetching — relative time is computed from a static ISO timestamp.
  useNow(30_000);

  const monitorQuery = useQuery({
    queryKey: ['monitors', id],
    queryFn: () => api.monitors.get(id!),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });

  const checksQuery = useQuery({
    queryKey: ['monitors', id, 'checks'],
    queryFn: () => api.checks.list(id!),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ['monitors', id, 'incidents'],
    queryFn: () => api.incidents.forMonitor(id!),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['monitors'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
  };

  const runCheckMutation = useMutation({
    mutationFn: () => api.checks.run(id!),
    onSuccess: () => {
      invalidate();
      toast('Check executed');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Check failed', 'error'),
  });

  const togglePauseMutation = useMutation({
    mutationFn: (monitor: MonitorDTO) =>
      monitor.isPaused ? api.monitors.resume(monitor.id) : api.monitors.pause(monitor.id),
    onSuccess: (updated) => {
      invalidate();
      toast(updated.isPaused ? `"${updated.name}" paused` : `"${updated.name}" resumed`);
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Action failed', 'error'),
  });

  const editMutation = useMutation({
    mutationFn: (input: MonitorFormValues) => api.monitors.update(id!, input),
    onSuccess: (updated) => {
      invalidate();
      setEditing(false);
      setEditError(null);
      toast(`"${updated.name}" updated`);
    },
    onError: (err) =>
      setEditError(err instanceof ApiError ? err.message : 'Could not update monitor'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.monitors.remove(id!),
    onSuccess: () => {
      invalidate();
      toast('Monitor deleted');
      navigate('/monitors');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not delete', 'error'),
  });

  const chartData = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range];
    return (checksQuery.data ?? [])
      .filter((c) => new Date(c.checkedAt).getTime() >= cutoff)
      .slice()
      .reverse()
      .map((check) => ({
        time: new Date(check.checkedAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        responseTime: check.responseTime,
      }));
  }, [checksQuery.data, range]);
  if (monitorQuery.isLoading) {
    return <PageSpinner />;
  }

  if (monitorQuery.isError || !monitorQuery.data) {
    return (
      <div className="space-y-6">
        <Link
          to="/monitors"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to monitors
        </Link>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted">Monitor not found or you don&apos;t have access.</p>
            <Button variant="secondary" className="mt-6" onClick={() => navigate('/monitors')}>
              Go to monitors
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monitor = monitorQuery.data;
  const checks = checksQuery.data ?? [];
  const incidents = incidentsQuery.data ?? [];
  const paused = monitor.isPaused;

  // Anti-flapping context — no new status is invented here, this only surfaces
  // the existing counters while the status is still being decided:
  //   UP/DOWN pending → "2 / 3 failed checks" (not DOWN until the threshold)
  //   DOWN recovering → "1 / 2 successful checks required for recovery"
  const antiFlapHint =
    !paused && monitor.status !== 'DOWN' && monitor.consecutiveFailures > 0
      ? `${monitor.consecutiveFailures} / ${monitor.failureThreshold} failed checks`
      : !paused && monitor.status === 'DOWN' && monitor.consecutiveSuccesses > 0
        ? `${monitor.consecutiveSuccesses} / ${monitor.recoveryThreshold} successful checks required for recovery`
        : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          to="/monitors"
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to monitors
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                {monitor.name}
              </h1>
              <StatusBadge status={monitor.status} isPaused={paused} />
            </div>
            <p className="mt-1.5 truncate font-mono text-sm text-muted">{monitor.url}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="muted">{monitor.method}</Badge>
              <Badge variant="muted">every {Math.round(monitor.interval / 1000)}s</Badge>
              <Badge variant="muted">timeout {monitor.timeout / 1000}s</Badge>
              {antiFlapHint && <span className="text-xs text-muted-dark">{antiFlapHint}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => togglePauseMutation.mutate(monitor)}
              loading={togglePauseMutation.isPending}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditError(null);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runCheckMutation.mutate()}
              loading={runCheckMutation.isPending}
            >
              <Play className="h-4 w-4" />
              Run Check
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {paused && (
        <div className="rounded-xl border border-warning/20 bg-warning-muted px-5 py-4">
          <p className="text-sm font-medium text-warning">Monitoring is paused</p>
          <p className="mt-0.5 text-sm text-muted">
            Automatic checks are disabled. Resume to continue monitoring this endpoint.
          </p>
        </div>
      )}
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Current Status"
          value={
            paused ? 'Paused' : monitor.status === 'UP' ? 'Operational' : monitor.status === 'DOWN' ? 'Down' : 'Unknown'
          }
          icon={monitor.status === 'DOWN' ? ArrowDownRight : ArrowUpRight}
          tone={paused ? 'default' : monitor.status === 'DOWN' ? 'danger' : monitor.status === 'UP' ? 'success' : 'default'}
        />
        <StatCard label="Response Time" value={formatMs(monitor.lastResponseTime)} icon={Gauge} />
        <StatCard label="Uptime 24h" value={formatPercent(monitor.uptime24h)} icon={Activity} />
        <StatCard label="Uptime 30d" value={formatPercent(monitor.uptime30d)} icon={Activity} />
        <StatCard label="Last Check" value={formatRelativeTime(monitor.lastCheckedAt)} icon={Timer} />
      </div>

      {/* Response time chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-foreground">Response Time</CardTitle>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(['24h', '7d', '30d'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  range === r ? 'bg-primary-muted text-primary' : 'text-muted hover:text-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No checks recorded yet.</p>
          ) : chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              No check data in this range yet.
            </p>
          ) : chartData.length === 1 ? (
            // A single point would render a misleading area — wait for more data.
            <p className="py-12 text-center text-sm text-muted">
              More data is needed to build the response time chart.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="responseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f1f23" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#52525b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}ms`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#131316',
                      border: '1px solid #27272a',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#a1a1aa' }}
                    formatter={(value) => [`${value} ms`, 'Response time']}
                  />
                  <Area
                    type="monotone"
                    dataKey="responseTime"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#responseFill)"
                    // With few points the line alone reads as a flat/empty chart —
                    // show the actual samples instead.
                    dot={
                      chartData.length <= 8
                        ? { r: 3, strokeWidth: 0, fill: '#10b981' }
                        : false
                    }
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Incident history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-foreground">Incident History</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {incidents.length === 0 ? (
            <p className="px-6 pb-8 pt-2 text-sm text-muted">No incidents recorded.</p>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Started</Th>
                  <Th>Resolved</Th>
                  <Th>Duration</Th>
                  <Th>Cause</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {incidents.map((incident) => (
                  <Tr key={incident.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(incident.startedAt)}</Td>
                    <Td className="whitespace-nowrap text-muted">
                      {incident.resolvedAt ? formatDateTime(incident.resolvedAt) : '—'}
                    </Td>
                    <Td className="text-muted">{formatDuration(incident.durationMs)}</Td>
                    <Td>
                      <span className="block max-w-[220px] truncate text-muted">{incident.cause}</span>
                    </Td>
                    <Td>
                      <Badge variant={incident.status === 'OPEN' ? 'danger' : 'success'} dot>
                        {incident.status === 'OPEN' ? 'Ongoing' : 'Resolved'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Check history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-foreground">Check History</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {checks.length === 0 ? (
            <p className="px-6 pb-8 pt-2 text-sm text-muted">No checks recorded yet.</p>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Timestamp</Th>
                  <Th>Status</Th>
                  <Th>HTTP Status</Th>
                  <Th>Response Time</Th>
                  <Th>Error</Th>
                </Tr>
              </THead>
              <TBody>
                {checks.map((check) => (
                  <Tr key={check.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(check.checkedAt)}</Td>
                    <Td>
                      <Badge variant={check.status === 'UP' ? 'success' : 'danger'} dot>
                        {check.status === 'UP' ? 'Up' : 'Down'}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-xs text-muted">{check.httpStatus ?? '—'}</Td>
                    <Td className="text-muted">{formatMs(check.responseTime)}</Td>
                    <Td>
                      <span className="block max-w-[280px] truncate text-xs text-muted-dark">
                        {check.error ?? '—'}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Drawer open={editing} onClose={() => setEditing(false)} title={`Edit ${monitor.name}`}>
        <MonitorForm
          monitor={monitor}
          onSubmit={(values) => editMutation.mutate(values)}
          onCancel={() => setEditing(false)}
          submitting={editMutation.isPending}
          serverError={editError}
          submitLabel="Save changes"
        />
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${monitor.name}"?`}
        description="This will permanently remove the monitor and its entire check history. This action cannot be undone."
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
