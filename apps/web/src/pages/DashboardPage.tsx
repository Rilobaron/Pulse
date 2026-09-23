import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Pause,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDuration, formatInterval, formatMs, formatPercent, formatRelativeTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCardSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useNow } from '@/lib/useNow';

export default function DashboardPage() {
  // Keep relative timestamps ("4 minutes ago") advancing without extra fetches.
  useNow(30_000);

  const statsQuery = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: api.stats.dashboard,
    refetchInterval: 30_000,
  });

  const monitorsQuery = useQuery({
    queryKey: ['monitors'],
    queryFn: api.monitors.list,
    refetchInterval: 30_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ['incidents'],
    queryFn: api.incidents.list,
    refetchInterval: 30_000,
  });

  const stats = statsQuery.data;
  const monitors = monitorsQuery.data ?? [];
  const incidents = incidentsQuery.data ?? [];

  const attention = monitors.filter((m) => !m.isPaused && m.status === 'DOWN');
  const recentIncidents = incidents.slice(0, 5);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Overview of all your monitored services</p>
        </div>
        <Link to="/monitors/new">
          <Button>
            <Plus className="h-4 w-4" />
            Create monitor
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {statsQuery.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total Monitors" value={stats?.total ?? 0} icon={Activity} />
            <StatCard label="Operational" value={stats?.up ?? 0} icon={ArrowUpRight} tone="success" />
            <StatCard label="Down" value={stats?.down ?? 0} icon={ArrowDownRight} tone="danger" />
            <StatCard label="Paused" value={stats?.paused ?? 0} icon={Pause} />
            <StatCard label="Active Incidents" value={stats?.activeIncidents ?? 0} icon={TriangleAlert} tone="danger" />
            <StatCard
              label="Avg Response"
              value={stats?.avgResponseTime != null ? formatMs(stats.avgResponseTime) : '—'}
              icon={Gauge}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Monitors overview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium text-foreground">Monitors Overview</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {monitorsQuery.isLoading ? (
              <TableSkeleton rows={4} />
            ) : monitors.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No monitors yet"
                description="Create your first monitor to start tracking uptime."
                action={
                  <Link to="/monitors/new">
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                      Create monitor
                    </Button>
                  </Link>
                }
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Status</Th>
                    <Th>Interval</Th>
                    <Th>Response</Th>
                    <Th>Last Check</Th>
                    <Th>Uptime</Th>
                  </Tr>
                </THead>
                <TBody>
                  {monitors.map((monitor) => (
                    <Tr key={monitor.id}>
                      <Td>
                        <Link
                          to={`/monitors/${monitor.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {monitor.name}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge status={monitor.status} isPaused={monitor.isPaused} />
                      </Td>
                      <Td className="text-muted">{formatInterval(monitor.interval)}</Td>
                      <Td className="text-muted">{formatMs(monitor.lastResponseTime)}</Td>
                      <Td className="text-muted">{formatRelativeTime(monitor.lastCheckedAt)}</Td>
                      <Td className="text-muted">{formatPercent(monitor.uptime30d)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {/* Right column: incidents + attention */}
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-foreground">Recent Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              {incidentsQuery.isLoading ? (
                <TableSkeleton rows={3} />
              ) : recentIncidents.length === 0 ? (
                <p className="py-4 text-sm text-muted">No incidents recorded.</p>
              ) : (
                <ul className="space-y-4">
                  {recentIncidents.map((incident) => (
                    <li key={incident.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {incident.monitorName ?? 'Monitor'}
                        </p>
                        <p className="truncate text-xs text-muted">{incident.cause}</p>
                        <p className="mt-0.5 text-xs text-muted-dark">
                          {formatRelativeTime(incident.startedAt)} · {formatDuration(incident.durationMs)}
                        </p>
                      </div>
                      <Badge variant={incident.status === 'OPEN' ? 'danger' : 'success'} dot>
                        {incident.status === 'OPEN' ? 'Ongoing' : 'Resolved'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-foreground">Needs Attention</CardTitle>
            </CardHeader>
            <CardContent>
              {attention.length === 0 ? (
                <p className="py-4 text-sm text-muted">No monitors are currently down.</p>
              ) : (
                <ul className="space-y-3">
                  {attention.map((monitor) => (
                    <li key={monitor.id}>
                      <Link
                        to={`/monitors/${monitor.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 transition-colors hover:bg-danger/20"
                      >
                        <span className="truncate text-sm font-medium text-foreground">
                          {monitor.name}
                        </span>
                        <StatusBadge status={monitor.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
