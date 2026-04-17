/**
 * API client service — wraps all fetch calls to the backend
 */
import { User, Contact, Meeting, SuggestedSlot, InsightsData } from '@syncup/shared';

const BASE = '/api';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ---- Auth ----

export const authApi = {
  me: () => request<{ data: User }>('/auth/me'),
  register: (name: string, email: string) =>
    request<{ data: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  updatePreferences: (prefs: Partial<User['preferences']>) =>
    request<{ data: User['preferences'] }>('/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),
  connectAppleCalendar: (username: string, appPassword: string) =>
    request<{ message: string }>('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ username, appPassword }),
    }),
  disconnectCalendar: (provider: string) =>
    request<{ message: string }>(`/auth/${provider}`, { method: 'DELETE' }),
};

/** Convenience helpers used by components */
export const api = {
  getMe: async (): Promise<User | null> => {
    try {
      const res = await authApi.me();
      return res.data;
    } catch {
      return null;
    }
  },
  disconnectCalendar: (provider: string) => authApi.disconnectCalendar(provider),
};

// ---- Contacts ----

export const contactsApi = {
  list: () => request<{ data: Contact[] }>('/contacts'),
  create: (data: { name: string; email: string; calendarProvider?: string; city?: string }) =>
    request<{ data: Contact }>('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Contact>) =>
    request<{ data: Contact }>(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/contacts/${id}`, { method: 'DELETE' }),
};

// ---- Meetings ----

export const meetingsApi = {
  list: (params?: { search?: string; from?: string; to?: string; contactId?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as [string, string][]).toString() : '';
    return request<{ data: Meeting[] }>(`/meetings${qs}`);
  },
  delete: (id: string) =>
    request<{ message: string }>(`/meetings/${id}`, { method: 'DELETE' }),
};

export const insightsApi = {
  get: () => request<{ data: InsightsData }>('/insights'),
};

// ---- Calendar status ----

export const calendarApi = {
  status: () =>
    request<{ data: { connected: boolean; provider: string | null } }>('/calendar/status'),
  sync: () =>
    request<{ data: { imported: number; skipped: number; trained: number; total: number; message: string } }>(
      '/calendar/sync',
      { method: 'POST' },
    ),
};

// ---- Chat (SSE streaming) ----

export interface StreamOptions {
  onText: (text: string) => void;
  onToolCall: (name: string) => void;
  onSlots: (slots: SuggestedSlot[]) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function sendChatMessage(
  message: string,
  options: StreamOptions,
): Promise<void> {
  const res = await fetch(`${BASE}/chat/message`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to connect' }));
    options.onError(body.error ?? 'Failed to send message');
    return;
  }

  // Parse the SSE stream
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = '';
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6).trim();
      } else if (line === '') {
        // Dispatch event
        if (currentEvent && currentData) {
          try {
            const parsed = JSON.parse(currentData);
            if (currentEvent === 'text') {
              options.onText(parsed.text ?? '');
            } else if (currentEvent === 'tool_call') {
              options.onToolCall(parsed.name ?? '');
            } else if (currentEvent === 'slots') {
              options.onSlots(parsed.slots ?? []);
            } else if (currentEvent === 'done') {
              options.onDone();
            } else if (currentEvent === 'error') {
              options.onError(parsed.error ?? 'Unknown error');
            }
          } catch {
            // Ignore malformed JSON
          }
        }
        currentEvent = '';
        currentData = '';
      }
    }
  }
}

export const chatApi = {
  clearHistory: () =>
    fetch(`${BASE}/chat/conversation`, {
      method: 'DELETE',
      credentials: 'include',
    }),
  history: () =>
    request<{ data: Array<{ role: string; content: string }> }>('/chat/history'),
};
