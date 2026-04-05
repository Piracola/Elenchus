/**
 * API client — typed fetch wrappers for the Elenchus REST API.
 */

import type {
    Session,
    SessionListItem,
    SessionCreatePayload,
    ModelConfig,
    ModelConfigCreatePayload,
    LogLevel,
    MarkdownExportCategory,
    ReferenceLibraryResponse,
    RuntimeEventPage,
    SearchConfig,
    SearchConfigUpdatePayload,
    SearchProviderStatus,
    SessionDocumentResponse,
} from '../types';

const BASE = import.meta.env.VITE_API_URL || '/api';
const INVALID_FILENAME_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

async function readErrorMessage(res: Response): Promise<string> {
    const text = await res.text();
    let message = `API ${res.status}`;
    try {
        const json = JSON.parse(text);
        const detail = json.detail ?? json.message;
        if (typeof detail === 'string' && detail.trim()) {
            message = detail;
        } else if (Array.isArray(detail) || (detail && typeof detail === 'object')) {
            message = JSON.stringify(detail);
        } else {
            message = text || message;
        }
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

function sanitizeFilenameSegment(value: string): string {
    return Array.from(value, (char) => {
        const code = char.charCodeAt(0);
        if (code < 32 || INVALID_FILENAME_CHARACTERS.has(char)) {
            return '_';
        }
        return char;
    }).join('');
}

function buildTopicFilename(topic: string, extension: string): string {
    const normalized = sanitizeFilenameSegment(topic.trim())
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '');
    const base = normalized || '未命名辩题';
    const suffix = extension.replace(/^\./, '') || 'txt';
    return `${base}.${suffix}`;
}

async function requestWithParser<T>(
    path: string,
    parser: (res: Response) => Promise<T>,
    init?: RequestInit,
): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
    if (!res.ok) {
        throw new Error(await readErrorMessage(res));
    }
    return parser(res);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    return requestWithParser(path, async (res) => {
        if (res.status === 204) return undefined as T;
        return res.json() as Promise<T>;
    }, init);
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
    return requestWithParser(path, (res) => res.text(), init);
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

        uploadDocument: async (id: string, file: File): Promise<SessionDocumentResponse> => {
            const body = new FormData();
            body.append('file', file);

            const res = await fetch(`${BASE}/sessions/${id}/documents`, {
                method: 'POST',
                body,
            });
            if (!res.ok) {
                throw new Error(await readErrorMessage(res));
            }
            return res.json() as Promise<SessionDocumentResponse>;
        },

        deleteDocument: (id: string, documentId: string): Promise<void> =>
            request(`/sessions/${id}/documents/${documentId}`, { method: 'DELETE' }),

        getReferenceLibrary: (id: string): Promise<ReferenceLibraryResponse> =>
            request(`/sessions/${id}/reference-library`),

        listRuntimeEvents: (
            id: string,
            options: { beforeSeq?: number; limit?: number } = {},
        ): Promise<RuntimeEventPage> => {
            const params = new URLSearchParams();
            if (typeof options.beforeSeq === 'number' && Number.isFinite(options.beforeSeq)) {
                params.set('before_seq', String(options.beforeSeq));
            }
            params.set('limit', String(options.limit ?? 200));
            return request(`/sessions/${id}/runtime-events?${params.toString()}`);
        },

        delete: (id: string): Promise<void> =>
            request(`/sessions/${id}`, { method: 'DELETE' }),

        exportJson: (id: string, topic: string): Promise<void> => {
            return download(`/sessions/${id}/export?format=json`, buildTopicFilename(topic, 'json'));
        },

        exportMarkdown: (id: string, topic: string, categories?: MarkdownExportCategory[]): Promise<void> => {
            const params = new URLSearchParams({ format: 'markdown' });
            categories?.forEach((category) => params.append('categories', category));
            return download(`/sessions/${id}/export?${params.toString()}`, buildTopicFilename(topic, 'md'));
        },

        exportRuntimeEventsSnapshot: (id: string, topic: string): Promise<void> => {
            return download(
                `/sessions/${id}/runtime-events/export`,
                buildTopicFilename(topic, 'runtime-events.json'),
            );
        },

        getRuntimeEventsSnapshot: (id: string): Promise<string> =>
            requestText(`/sessions/${id}/runtime-events/export`),
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
        getConfig: (): Promise<SearchConfig> =>
            request('/search/config'),

        setProvider: (provider: string): Promise<{ status: string; provider: string }> =>
            request('/search/config', {
                method: 'POST',
                body: JSON.stringify({ provider }),
            }),

        updateConfig: (payload: SearchConfigUpdatePayload): Promise<SearchConfig> =>
            request('/search/config', {
                method: 'PUT',
                body: JSON.stringify(payload),
            }),

        getProviders: (): Promise<SearchProviderStatus[]> =>
            request('/search/providers'),

        getHealth: (): Promise<{ status: string; provider: string | null }> =>
            request('/search/health'),
    },

    searxng: {
        getStatus: (): Promise<{
            docker_available: boolean;
            searxng_running: boolean;
            searxng_healthy: boolean;
            searxng_url: string;
        }> =>
            request('/searxng/status'),

        start: (): Promise<{ success: boolean; message: string }> =>
            request('/searxng/start', {
                method: 'POST',
            }),

        stop: (): Promise<{ success: boolean; message: string }> =>
            request('/searxng/stop', {
                method: 'POST',
            }),
    },
};
