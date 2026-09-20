import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Monitor as MonitorIcon } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FieldError, Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function StatusPageSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [monitorIds, setMonitorIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pageQuery = useQuery({ queryKey: ['status-page'], queryFn: api.statusPage.get });
  const monitorsQuery = useQuery({ queryKey: ['monitors'], queryFn: api.monitors.list });

  // Hydrate local form state once the saved page loads
  useEffect(() => {
    const page = pageQuery.data;
    if (!page) return;
    setName(page.name);
    setSlug(page.slug);
    setDescription(page.description);
    setIsPublished(page.isPublished);
    setMonitorIds(page.monitorIds);
  }, [pageQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.statusPage.save({ name, slug, description, isPublished, monitorIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['status-page'] });
      toast('Status page saved');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  });

  const monitors = monitorsQuery.data ?? [];
  const slugValid = SLUG_PATTERN.test(slug);
  const canSave = name.trim().length >= 2 && slugValid && !saveMutation.isPending;

  const toggleMonitor = (id: string) => {
    setMonitorIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Status Page</h1>
        <p className="mt-1 text-sm text-muted">
          Publish a public page showing the current health of your services
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-foreground">General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {error && (
                <div className="rounded-lg border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="sp-name">Name</Label>
                <Input
                  id="sp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Pulse Demo Status"
                />
              </div>

              <div>
                <Label htmlFor="sp-slug">Slug</Label>
                <Input
                  id="sp-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="pulse-demo"
                  className="font-mono"
                />
                {!slugValid && slug.length > 0 && (
                  <FieldError message="Use lowercase letters, numbers and hyphens only" />
                )}
                <p className="mt-1.5 text-xs text-muted-dark">
                  Public URL: <span className="font-mono">/status/{slug || 'your-slug'}</span>
                </p>
              </div>

              <div>
                <Label htmlFor="sp-description">Description</Label>
                <Input
                  id="sp-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Live status of the Pulse demo services"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Published</p>
                  <p className="text-xs text-muted">
                    When off, the public page returns 404 and is not reachable.
                  </p>
                </div>
                <Switch
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                  aria-label="Publish status page"
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-5">
                {isPublished && slug ? (
                  <a
                    href={`/status/${slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover"
                  >
                    View public page
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span />
                )}
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!canSave}
                  loading={saveMutation.isPending}
                >
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-foreground">
                Monitors on this page
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monitorsQuery.isLoading ? (
                <TableSkeleton rows={3} />
              ) : monitors.length === 0 ? (
                <EmptyState
                  icon={MonitorIcon}
                  title="No monitors available"
                  description="Create a monitor first, then select which ones appear publicly."
                />
              ) : (
                <ul className="space-y-2">
                  {monitors.map((monitor) => (
                    <li
                      key={monitor.id}
                      className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{monitor.name}</p>
                        <p className="truncate font-mono text-xs text-muted-dark">{monitor.url}</p>
                      </div>
                      <Switch
                        checked={monitorIds.includes(monitor.id)}
                        onCheckedChange={() => toggleMonitor(monitor.id)}
                        aria-label={`Include ${monitor.name}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium text-foreground">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-lg font-semibold text-foreground">{name || 'Untitled Status'}</p>
              {description && <p className="text-sm text-muted">{description}</p>}
              <p className="text-xs text-muted-dark">
                {monitorIds.length} monitor{monitorIds.length === 1 ? '' : 's'} selected
              </p>
              <p className="text-xs">
                <span className={isPublished ? 'text-primary' : 'text-muted-dark'}>
                  {isPublished ? 'Published' : 'Not published'}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
