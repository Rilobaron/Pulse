import type {
  AuthResponse,
  CreateMonitorInput,
  DashboardStats,
  IncidentDTO,
  LoginInput,
  MonitorCheckDTO,
  MonitorDTO,
  NotificationChannelDTO,
  NotificationChannelInput,
  NotificationChannelSecretResponse,
  NotificationDeliveryDTO,
  PublicStatusPage,
  RegisterInput,
  StatusPageDTO,
  StatusPageInput,
  UpdateMonitorInput,
  UpdateNotificationChannelInput,
  UserDTO,
} from '@pulse/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem('pulse_token');
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('pulse_token', token);
  } else {
    localStorage.removeItem('pulse_token');
  }
}

// Origin of the API. Set VITE_API_URL at build time (e.g. on Vercel) to call a separate
// backend; when unset, requests stay relative ("/api/...") and go through the Vite dev
// proxy or the nginx proxy. Trailing slashes are stripped so we never emit "//api".
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
  } catch {
    // fetch only rejects when no HTTP response was received (server down, DNS, or a
    // CORS block, which the browser reports the same way). Surface that distinctly
    // instead of letting callers fall back to a generic message.
    throw new ApiError(0, 'Unable to reach the server. Please check your connection and try again.');
  }

  // Auto-logout on expired/invalid token for protected requests
  if (response.status === 401 && token) {
    setToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    throw new ApiError(response.status, data.message ?? `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  auth: {
    register: (input: RegisterInput) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
    login: (input: LoginInput) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    me: () => request<UserDTO>('/auth/me'),
  },
  monitors: {
    list: () => request<MonitorDTO[]>('/monitors'),
    get: (id: string) => request<MonitorDTO>(`/monitors/${id}`),
    create: (input: CreateMonitorInput) =>
      request<MonitorDTO>('/monitors', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: UpdateMonitorInput) =>
      request<MonitorDTO>(`/monitors/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/monitors/${id}`, { method: 'DELETE' }),
    pause: (id: string) => request<MonitorDTO>(`/monitors/${id}/pause`, { method: 'POST' }),
    resume: (id: string) => request<MonitorDTO>(`/monitors/${id}/resume`, { method: 'POST' }),
  },
  checks: {
    list: (monitorId: string) => request<MonitorCheckDTO[]>(`/monitors/${monitorId}/checks`),
    run: (monitorId: string) =>
      request<MonitorCheckDTO>(`/monitors/${monitorId}/check`, { method: 'POST' }),
  },
  incidents: {
    list: () => request<IncidentDTO[]>('/incidents'),
    forMonitor: (monitorId: string) => request<IncidentDTO[]>(`/monitors/${monitorId}/incidents`),
  },
  statusPage: {
    get: () => request<StatusPageDTO | null>('/status-page'),
    save: (input: StatusPageInput) =>
      request<StatusPageDTO>('/status-page', { method: 'PUT', body: JSON.stringify(input) }),
  },
  publicStatus: {
    get: (slug: string) => request<PublicStatusPage>(`/public/status-pages/${slug}`),
  },
  notificationChannels: {
    list: () => request<NotificationChannelDTO[]>('/notification-channels'),
    create: (input: NotificationChannelInput) =>
      request<NotificationChannelSecretResponse>('/notification-channels', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: UpdateNotificationChannelInput) =>
      request<NotificationChannelSecretResponse>(`/notification-channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) => request<void>(`/notification-channels/${id}`, { method: 'DELETE' }),
    test: (id: string) => request<NotificationDeliveryDTO>(`/notification-channels/${id}/test`, { method: 'POST' }),
  },
  notifications: {
    deliveries: (filters: { monitorId?: string; status?: string } = {}) => {
      const query = new URLSearchParams();
      if (filters.monitorId) query.set('monitorId', filters.monitorId);
      if (filters.status) query.set('status', filters.status);
      const qs = query.toString();
      return request<NotificationDeliveryDTO[]>(`/notification-deliveries${qs ? `?${qs}` : ''}`);
    },
  },
  stats: {
    dashboard: () => request<DashboardStats>('/stats/dashboard'),
  },
};
