import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent } from '@/components/ui/Card';
import { MonitorForm, type MonitorFormValues } from '@/components/MonitorForm';

export default function NewMonitorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: MonitorFormValues) => api.monitors.create(input),
    onSuccess: (monitor) => {
      void queryClient.invalidateQueries({ queryKey: ['monitors'] });
      toast(`Monitor "${monitor.name}" created`);
      navigate(`/monitors/${monitor.id}`);
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not create monitor.');
    },
  });

  const onSubmit = (values: MonitorFormValues) => {
    setServerError(null);
    createMutation.mutate(values);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/monitors"
        className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to monitors
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">New Monitor</h1>
        <p className="mt-1 text-sm text-muted">
          Pulse will periodically send an HTTP request and record uptime and response time.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <MonitorForm
            onSubmit={onSubmit}
            onCancel={() => navigate('/monitors')}
            submitting={createMutation.isPending}
            serverError={serverError}
            submitLabel="Create Monitor"
          />
        </CardContent>
      </Card>
    </div>
  );
}
