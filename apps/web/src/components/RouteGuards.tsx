import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Route guards live apart from `router.tsx` so that file only exports the
 * router configuration (Fast Refresh) and these stay pure components.
 */
function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
