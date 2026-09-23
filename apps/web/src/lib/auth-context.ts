import { createContext, useContext } from 'react';
import type { LoginInput, RegisterInput, UserDTO } from '@pulse/shared';

/**
 * Auth context lives in its own module so `auth.tsx` only exports components
 * (Fast Refresh) while `useAuth` stays available to non-component files.
 */
export interface AuthContextValue {
  user: UserDTO | null;
  /** True while the initial session is being restored from the stored token. */
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
