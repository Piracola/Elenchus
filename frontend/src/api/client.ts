/**
 * API client — typed fetch wrappers for the Elenchus REST API.
 */

import type { Session, SessionListItem, SessionCreatePayload } from '../types';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
    }
    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json();
}

// ── Sessions ─────────────────────────────────────────────────────

export const api = {
    sessions: {
        list: (): Promise<{ sessions: SessionListItem[]; total: number }> =>
            request('/sessions'),

        create: (payload: SessionCreatePayload): Promise<Session> =>
            request('/sessions', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),

        get: (id: string): Promise<Session> =>
            request(`/sessions/${id}`),

        delete: (id: string): Promise<void> =>
            request(`/sessions/${id}`, { method: 'DELETE' }),

        exportJson: (id: string): void => {
            window.open(`${BASE}/sessions/${id}/export?format=json`, '_blank');
        },

        exportMarkdown: (id: string): void => {
            window.open(`${BASE}/sessions/${id}/export?format=markdown`, '_blank');
        },
    },

    health: {
        check: (): Promise<{ status: string; service: string }> =>
            request('/health').catch(() => ({ status: 'error', service: 'elenchus' })),
        searchCheck: (): Promise<{ status: string; provider: string | null }> =>
            request('/health/search').catch(() => ({ status: 'error', provider: null })),
    },
};
