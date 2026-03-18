/**
 * API client — typed fetch wrappers for the Elenchus REST API.
 */

import type { Session, SessionListItem, SessionCreatePayload, ModelConfig, ModelConfigCreatePayload, LogLevel } from '../types';

const BASE = import.meta.env.VITE_API_URL || '/api';

async function readErrorMessage(res: Response): Promise<string> {
    const text = await res.text();
    let message = `API ${res.status}`;
    try {
        const json = JSON.parse(text);
        message = json.detail ?? json.message ?? text;
    } catch {
        message = text || message;
    }
    return message;
}

function getFilename(contentDisposition: string | null, fallback: string): string {
    if (!contentDisposition) {
        return fallback;
    }

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch {
            return utf8Match[1];
        }
    }

    const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch?.[1]) {
        return plainMatch[1];
    }

    return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
    if (!res.ok) {
        throw new Error(await readErrorMessage(res));
    }
    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json();
}

async function download(path: string, fallbackFilename: string): Promise<void> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
        throw new Error(await readErrorMessage(res));
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getFilename(res.headers.get('Content-Disposition'), fallbackFilename);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

// ── Sessions ─────────────────────────────────────────────────────

export const api = {
    sessions: {
        list: (offset = 0, limit = 50): Promise<{ sessions: SessionListItem[]; total: number }> =>
            request(`/sessions?offset=${offset}&limit=${limit}`),

        create: (payload: SessionCreatePayload): Promise<Session> =>
            request('/sessions', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),

        get: (id: string): Promise<Session> =>
            request(`/sessions/${id}`),

        delete: (id: string): Promise<void> =>
            request(`/sessions/${id}`, { method: 'DELETE' }),

        exportJson: (id: string): Promise<void> => {
            return download(`/sessions/${id}/export?format=json`, `elenchus_session_${id}.json`);
        },

        exportMarkdown: (id: string): Promise<void> => {
            return download(`/sessions/${id}/export?format=markdown`, `elenchus_session_${id}.md`);
        },
    },

    models: {
        list: (): Promise<ModelConfig[]> =>
            request('/models'),

        create: (payload: ModelConfigCreatePayload): Promise<ModelConfig> =>
            request('/models', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),

        update: (id: string, payload: Partial<ModelConfigCreatePayload>): Promise<ModelConfig> =>
            request(`/models/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            }),

        delete: (id: string): Promise<void> =>
            request(`/models/${id}`, { method: 'DELETE' }),
    },

    health: {
        check: (): Promise<{ status: string; service: string }> =>
            request<{ status: string; service: string }>('/health').catch(() => ({ status: 'error', service: 'elenchus' })),
        searchCheck: (): Promise<{ status: string; provider: string | null }> =>
            request<{ status: string; provider: string | null }>('/health/search').catch(() => ({ status: 'error', provider: null })),
    },

    log: {
        getLevel: (): Promise<{ level: string }> =>
            request('/log/level'),

        setLevel: (level: LogLevel): Promise<{ level: string }> =>
            request('/log/level', {
                method: 'PUT',
                body: JSON.stringify({ level }),
            }),

        getLevels: (): Promise<{ levels: string[]; current: string }> =>
            request('/log/levels'),
    },

    search: {
        getConfig: (): Promise<{ provider: string; available_providers: Array<{ name: string; available: boolean; is_primary: boolean }> }> =>
            request('/search/config'),

        setProvider: (provider: string): Promise<{ status: string; provider: string }> =>
            request('/search/config', {
                method: 'POST',
                body: JSON.stringify({ provider }),
            }),

        getProviders: (): Promise<Array<{ name: string; available: boolean; is_primary: boolean }>> =>
            request('/search/providers'),

        getHealth: (): Promise<{ status: string; provider: string | null }> =>
            request('/search/health'),
    },
};
