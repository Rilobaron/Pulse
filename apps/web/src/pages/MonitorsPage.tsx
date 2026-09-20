import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor as MonitorIcon, Pencil, Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { MonitorDTO } from '@pulse/shared';
import { ApiError, api } from '@/lib/api';
import { formatInterval, formatMs, formatRelativeTime } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { MonitorForm, type MonitorFormValues } from '@/components/MonitorForm';
import { useToast } from '@/components/ui/Toast';

export default function MonitorsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [monitorToDelete, setMonitorToDelete] = useState<MonitorDTO | null>(null);
  const [monitorToEdit, setMonitorToEdit] = useState<MonitorDTO | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const monitorsQuery = useQuery({
    queryKey: ['monitors'],
    queryFn: api.monitors.list,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['monitors'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.monitors.remove(id),
    onSuccess: () => {
      invalidate();
      setMonitorToDelete(null);
      toast('Monitor deleted');
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : 'Could not delete monitor', 'error'),
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
    mutationFn: ({ id, input }: { id: string; input: MonitorFormValues }) =>
      api.monitors.update(id, input),
    onSuccess: (updated) => {
      invalidate();
      setMonitorToEdit(null);
      setEditError(null);
      toast(`"${updated.name}" updated`);
    },
    onError: (err) =>
      setEditError(err instanceof ApiError ? err.message : 'Could not update monitor'),
  });

  const monitors = monitorsQuery.data ?? [];
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Monitors</h1>
          <p className="mt-1 text-sm text-muted">Manage the endpoints Pulse keeps an eye on</p>
        </div>
        <Link to="/monitors/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Monitor
          </Button>
        </Link>
      </div>

      <Card>
        {monitorsQuery.isLoading ? (
          <TableSkeleton rows={4} />
        ) : monitors.length === 0 ? (
          <EmptyState
            icon={MonitorIcon}
            title="No monitors yet"
            description="Add a website or API endpoint to start monitoring its uptime and response time."
            action={
              <Link to="/monitors/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  New Monitor
                </Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Endpoint</Th>
                <Th>Status</Th>
                <Th>Interval</Th>
                <Th>Response Time</Th>
                <Th>Last Check</Th>
                <Th className="w-32 text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {monitors.map((monitor) => (
                <Tr
                  key={monitor.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/monitors/${monitor.id}`)}
                >
                  <Td className="font-medium text-foreground">{monitor.name}</Td>
                  <Td>
                    <span className="block max-w-[260px] truncate font-mono text-xs text-muted">
                      {monitor.method} {monitor.url}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={monitor.status} isPaused={monitor.isPaused} />
                  </Td>
                  <Td className="text-muted">{formatInterval(monitor.interval)}</Td>
                  <Td className="text-muted">{formatMs(monitor.lastResponseTime)}</Td>
                  <Td className="text-muted">{formatRelativeTime(monitor.lastCheckedAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded-lg p-2 text-muted-dark transition-colors hover:bg-card-hover hover:text-foreground disabled:opacity-40"
                        aria-label={monitor.isPaused ? `Resume ${monitor.name}` : `Pause ${monitor.name}`}
                        disabled={togglePauseMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePauseMutation.mutate(monitor);
                        }}
                      >
                        {monitor.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </button>
                      <button
                        className="rounded-lg p-2 text-muted-dark transition-colors hover:bg-card-hover hover:text-foreground"
                        aria-label={`Edit ${monitor.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditError(null);
                          setMonitorToEdit(monitor);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-lg p-2 text-muted-dark transition-colors hover:bg-danger-muted hover:text-danger"
                        aria-label={`Delete ${monitor.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMonitorToDelete(monitor);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Drawer
        open={monitorToEdit !== null}
        onClose={() => setMonitorToEdit(null)}
        title={`Edit ${monitorToEdit?.name ?? 'monitor'}`}
      >
        {monitorToEdit && (
          <MonitorForm
            monitor={monitorToEdit}
            onSubmit={(values) => editMutation.mutate({ id: monitorToEdit.id, input: values })}
            onCancel={() => setMonitorToEdit(null)}
            submitting={editMutation.isPending}
            serverError={editError}
            submitLabel="Save changes"
          />
        )}
      </Drawer>

      <ConfirmDialog
        open={monitorToDelete !== null}
        title={`Delete "${monitorToDelete?.name}"?`}
        description="This will permanently remove the monitor and its entire check history. This action cannot be undone."
        loading={deleteMutation.isPending}
        onConfirm={() => monitorToDelete && deleteMutation.mutate(monitorToDelete.id)}
        onCancel={() => setMonitorToDelete(null)}
      />
    </div>
  );
}
