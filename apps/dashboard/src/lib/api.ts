import type { ApiResponse } from '@attendance-engine/schema';

const BASE = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('ae_token');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error((json as any).error?.message ?? 'Request failed');
  return (json as any).data as T;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; name: string; email: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ id: string; email: string; name: string }>('/auth/me'),
  },

  admin: {
    health: () => request<any>('/admin/health'),
    imports: (params?: Record<string, string>) =>
      request<any>(`/admin/imports?${new URLSearchParams(params ?? {})}`),
    importById: (id: string) => request<any>(`/admin/imports/${id}`),
    parseErrors: (params?: Record<string, string>) =>
      request<any>(`/admin/parse-errors?${new URLSearchParams(params ?? {})}`),
    events: (params?: Record<string, string>) =>
      request<any>(`/admin/events?${new URLSearchParams(params ?? {})}`),
    apiKeys: () => request<any[]>('/admin/api-keys'),
    createApiKey: (name: string, permissions: string[]) =>
      request<any>('/admin/api-keys', { method: 'POST', body: JSON.stringify({ name, permissions }) }),
    revokeApiKey: (id: string) =>
      request<any>(`/admin/api-keys/${id}`, { method: 'DELETE' }),
    departments: () => request<string[]>('/admin/meta/departments'),
    classes: (department?: string) =>
      request<any[]>(`/admin/meta/classes${department ? `?department=${department}` : ''}`),
  },

  summary: {
    overview: (date?: string) =>
      request<any>(`/summary/overview${date ? `?date=${date}` : ''}`),
    department: (date?: string) =>
      request<any[]>(`/summary/department${date ? `?date=${date}` : ''}`),
    class: (date?: string, department?: string) =>
      request<any[]>(`/summary/class?${new URLSearchParams({ ...(date ? { date } : {}), ...(department ? { department } : {}) })}`),
    trend: (days = 30, department?: string) =>
      request<any[]>(`/summary/trend?days=${days}${department ? `&department=${department}` : ''}`),
    student: (studentId: string, dateFrom?: string, dateTo?: string) =>
      request<any>(`/summary/student/${studentId}?${new URLSearchParams({ ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) })}`),
  },

  attendance: {
    list: (params?: Record<string, string>) =>
      request<any>(`/attendance?${new URLSearchParams(params ?? {})}`),
    absenteesToday: (params?: Record<string, string>) =>
      request<any[]>(`/attendance/absentees/today?${new URLSearchParams(params ?? {})}`),
    absenteesByDate: (date: string, params?: Record<string, string>) =>
      request<any[]>(`/attendance/absentees/date/${date}?${new URLSearchParams(params ?? {})}`),
  },
};
