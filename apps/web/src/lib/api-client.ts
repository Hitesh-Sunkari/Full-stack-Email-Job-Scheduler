import {
  UserProfile,
  SenderAccount,
  EmailCampaign,
  ScheduledEmailItem,
  SlackConnectionInfo,
  EmailStatsSummary,
  ApiResponse,
  ScheduleEmailInput,
  CreateSenderInput,
  SearchEmailsQuery,
} from '../types/api';

const BASE_URL = '/api';

class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Ensures HTTP-only session cookies are sent
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? ((await response.json()) as ApiResponse<T>) : null;

  if (!response.ok) {
    const errorMsg = payload?.error?.message || response.statusText || 'Request failed';
    const errorCode = payload?.error?.code || `HTTP_${response.status}`;
    throw new ApiError(errorMsg, errorCode, payload?.error?.details);
  }

  return (payload?.data as T) ?? (null as unknown as T);
}

export const api = {
  auth: {
    me: () => request<UserProfile>('/auth/me'),
    logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
    status: () =>
      request<{ isGoogleConfigured: boolean; isAuthenticated: boolean }>('/auth/status'),
    devLogin: () => request<UserProfile>('/auth/dev-login', { method: 'POST' }),
  },

  emails: {
    getScheduled: (page: number = 1, limit: number = 20) =>
      request<ScheduledEmailItem[]>(`/emails/scheduled?page=${page}&limit=${limit}`),

    getSent: (page: number = 1, limit: number = 20) =>
      request<ScheduledEmailItem[]>(`/emails/sent?page=${page}&limit=${limit}`),

    getStats: () => request<EmailStatsSummary>('/emails/stats/summary'),

    schedule: (payload: ScheduleEmailInput) =>
      request<{ campaignId: string; totalScheduled: number; firstSendTime: string; estimatedCompletionTime: string }>(
        '/emails/schedule',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),

    cancel: (id: string) => request<{ message: string }>(`/emails/${id}/cancel`, { method: 'POST' }),

    search: (query: SearchEmailsQuery) => {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.senderId) params.set('senderId', query.senderId);
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      return request<ScheduledEmailItem[]>(`/search/emails?${params.toString()}`);
    },
  },

  campaigns: {
    list: () => request<EmailCampaign[]>('/campaigns'),
  },

  senders: {
    list: () => request<SenderAccount[]>('/senders'),
    create: (payload: CreateSenderInput) =>
      request<SenderAccount>('/senders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    createEthereal: () =>
      request<SenderAccount>('/senders/ethereal', {
        method: 'POST',
      }),
  },

  slack: {
    getStatus: () => request<SlackConnectionInfo & { isConfigured: boolean }>('/integrations/slack'),
    disconnect: () => request<{ message: string }>('/integrations/slack/disconnect', { method: 'POST' }),
    sendTest: () => request<{ message: string }>('/integrations/slack/test', { method: 'POST' }),
  },
};
