import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
      <p className="mt-8 text-xs text-muted-dark">
        Pulse — Uptime monitoring for websites and APIs
      </p>
    </div>
  );
}
