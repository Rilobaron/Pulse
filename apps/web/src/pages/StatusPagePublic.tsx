import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import type { GlobalStatus } from '@pulse/shared';
import { api } from '@/lib/api';
import { formatDuration, formatPercent, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { UptimeBar } from '@/components/UptimeBar';
import { Logo } from '@/components/Logo';

const globalConfig: Record<GlobalStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  ALL_OPERATIONAL: {
    label: 'All systems operational',
    icon: CheckCircle2,
    className: 'text-primary',
  },
  PARTIAL_OUTAGE: {
    label: 'Partial outage',
    icon: TriangleAlert,
    className: 'text-warning',
  },
  MAJOR_OUTAGE: {
    label: 'Major outage',
    icon: XCircle,
    className: 'text-danger',
  },
};

export default function StatusPagePublic() {
  const { slug } = useParams<{ slug: string }>();

  const pageQuery = useQuery({
    queryKey: ['public-status', slug],
    queryFn: () => api.publicStatus.get(slug!),
    enabled: Boolean(slug),
    refetchInterval: 30_000,
    retry: false,
  });

  if (pageQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSpinner />
      </div>
    );
  }

  if (pageQuery.isError || !pageQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Logo className="mb-6" />
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <h1 className="text-lg font-semibold text-foreground">Status page not found</h1>
            <p className="mt-2 text-sm text-muted">
              This status page doesn&apos;t exist or is not published yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const page = pageQuery.data;
  const global = globalConfig[page.globalStatus];
  const GlobalIcon = global.icon;
  const openIncidents = page.incidents.filter((i) => i.status === 'OPEN');
  // "Past incidents" must not repeat the ones already shown as ongoing.
  const pastIncidents = page.incidents.filter((i) => i.status === 'RESOLVED');
  const globalBannerTone = {
    ALL_OPERATIONAL: 'border-primary/20 bg-primary-muted/30',
    PARTIAL_OUTAGE: 'border-warning/20 bg-warning-muted/30',
    MAJOR_OUTAGE: 'border-danger/20 bg-danger-muted/30',
  }[page.globalStatus];
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="mb-10">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {page.name}
          </h1>
          {page.description && <p className="mt-2 text-sm text-muted">{page.description}</p>}
        </div>

        {/* Global status banner */}
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${globalBannerTone}`}
        >
          <GlobalIcon className={`h-5 w-5 ${global.className}`} />
          <p className="text-sm font-medium text-foreground">{global.label}</p>
        </div>

        {/* Open incidents */}
        {openIncidents.length > 0 && (
          <div className="mt-6 space-y-3">
            {openIncidents.map((incident) => (
              <div
                key={incident.id}
                className="rounded-xl border border-danger/20 bg-danger-muted px-5 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {incident.monitorName} — incident in progress
                  </p>
                  <Badge variant="danger" dot>
                    Ongoing
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{incident.cause}</p>
                <p className="mt-1 text-xs text-muted-dark">
                  Started {formatRelativeTime(incident.startedAt)} · ongoing for{' '}
                  {formatDuration(incident.durationMs)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Monitors */}
        <div className="mt-6 space-y-4">
          {page.monitors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted">No services are being published yet.</p>
              </CardContent>
            </Card>
          ) : (
            page.monitors.map((monitor) => (
              <Card key={monitor.id}>
                <CardContent className="py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-muted-dark" />
                      <span className="font-medium text-foreground">{monitor.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted">
                        {formatPercent(monitor.uptime30d)} uptime
                      </span>
                      {monitor.isPaused ? (
                        <Badge variant="warning" dot>
                          Paused
                        </Badge>
                      ) : (
                        <Badge
                          variant={
                            monitor.status === 'UP'
                              ? 'success'
                              : monitor.status === 'DOWN'
                                ? 'danger'
                                : 'muted'
                          }
                          dot
                        >
                          {monitor.status === 'UP'
                            ? 'Operational'
                            : monitor.status === 'DOWN'
                              ? 'Major outage'
                              : 'Unknown'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <UptimeBar days={monitor.dailyUptime} />
                    <div className="mt-1.5 flex justify-between text-xs text-muted-dark">
                      <span>30 days ago</span>
                      <span>Today</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        {/* Past incidents — shown only when there is something to report */}
        {(pastIncidents.length > 0 || page.incidents.length === 0) && (
          <div className="mt-10">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-dark">
              Past Incidents
            </h2>
            {pastIncidents.length === 0 ? (
              <Card className="mt-4">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted">No incidents reported.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-4 space-y-3">
                {pastIncidents.map((incident) => (
                <Card key={incident.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {incident.monitorName} outage
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatRelativeTime(incident.startedAt)} · {incident.cause}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-dark">
                        {formatDuration(incident.durationMs)}
                      </span>
                      <Badge variant={incident.status === 'OPEN' ? 'danger' : 'success'} dot>
                        {incident.status === 'OPEN' ? 'Ongoing' : 'Resolved'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-12 text-center text-xs text-muted-dark">
          Powered by <span className="font-medium text-muted">Pulse</span>
        </p>
      </div>
    </div>
  );
}
