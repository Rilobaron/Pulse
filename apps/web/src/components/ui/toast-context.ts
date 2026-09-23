import { createContext, useContext } from 'react';

/**
 * Toast context lives in its own module so `Toast.tsx` only exports components
 * (Fast Refresh) while `useToast` stays available to pages.
 */
export type ToastType = 'success' | 'error';

export interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
