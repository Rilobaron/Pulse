import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/RouteGuards';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import MonitorsPage from '@/pages/MonitorsPage';
import NewMonitorPage from '@/pages/NewMonitorPage';
import MonitorDetailPage from '@/pages/MonitorDetailPage';
import StatusPageSettingsPage from '@/pages/StatusPageSettingsPage';
import StatusPagePublic from '@/pages/StatusPagePublic';
import NotificationsSettingsPage from '@/pages/NotificationsSettingsPage';

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
