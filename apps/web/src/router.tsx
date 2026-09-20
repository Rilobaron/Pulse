import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Spinner } from '@/components/ui/Spinner';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import MonitorsPage from '@/pages/MonitorsPage';
import NewMonitorPage from '@/pages/NewMonitorPage';
import MonitorDetailPage from '@/pages/MonitorDetailPage';
import StatusPageSettingsPage from '@/pages/StatusPageSettingsPage';
import StatusPagePublic from '@/pages/StatusPagePublic';
import NotificationsSettingsPage from '@/pages/NotificationsSettingsPage';

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  // Public status pages — no authentication required
  { path: '/status-page', element: <Navigate to="/status/pulse-demo" replace /> },
  { path: '/status/:slug', element: <StatusPagePublic /> },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/monitors', element: <MonitorsPage /> },
          { path: '/monitors/new', element: <NewMonitorPage /> },
          { path: '/monitors/:id', element: <MonitorDetailPage /> },
          { path: '/settings/status-page', element: <StatusPageSettingsPage /> },
          { path: '/settings/notifications', element: <NotificationsSettingsPage /> },
        ],
      },
    ],
  },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
