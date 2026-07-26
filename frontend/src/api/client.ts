/**
 * API client — typed fetch wrappers for the Elenchus REST API.
 */

import type {
    Session,
    SessionAgentConfigsUpdatePayload,
    SessionListItem,
    SessionCreatePayload,
    RecentDebateConfig,
    ModelConfig,
    ModelConfigCreatePayload,
    ModelProviderModelsResult,
    ModelProviderProbePayload,
    ModelProviderProbeResult,
    LogLevel,
    MarkdownExportCategory,
    RuntimeSettings,
    SessionDocumentsResponse,
    SearchConfig,
    SearchConfigUpdatePayload,
    SearchProviderStatus,
    SessionDocumentResponse,
    PendingRunCommand,
    RunCommandAck,
    RunCommandType,
    RunProjectionResponse,
    RunSummary,
    RuntimeEvent,
} from '../types';

const BASE = import.meta.env.VITE_API_URL || '/api';
const INVALID_FILENAME_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

function getApiBase(): string {
    if (/^https?:\/\//i.test(BASE)) {
        return BASE.replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return new URL(BASE, window.location.origin).toString().replace(/\/+$/, '');
    }

    return BASE.replace(/\/+$/, '');
}

function buildApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${getApiBase()}${normalizedPath}`;
}

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
    const res = await fetch(buildApiUrl(path), {
        credentials: 'include',
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
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

async function download(path: string, fallbackFilename: string): Promise<void> {
    const res = await fetch(buildApiUrl(path), { credentials: 'include' });
    if (!res.ok) {
        throw new Error(await readErrorMessage(res));
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getFilename(res.headers.get('Content-Disposition'), fallbackFilename);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    // Delay cleanup to ensure the browser has started the download
    setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }, 100);
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

        recentConfig: (): Promise<RecentDebateConfig | null> =>
            requestWithParser('/sessions/recent-config', async (res) => {
                if (res.status === 204) return null;
                return res.json() as Promise<RecentDebateConfig>;
            }),

        get: (id: string): Promise<Session> =>
            request(`/sessions/${id}`),

        updateAgentConfigs: (id: string, payload: SessionAgentConfigsUpdatePayload): Promise<Session> =>
            request(`/sessions/${id}/agent-configs`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            }),

        uploadDocument: async (id: string, file: File): Promise<SessionDocumentResponse> => {
            const body = new FormData();
            body.append('file', file);

            const res = await fetch(buildApiUrl(`/sessions/${id}/documents`), {
                method: 'POST',
                credentials: 'include',
                body,
            });
            if (!res.ok) {
                throw new Error(await readErrorMessage(res));
            }
            return res.json() as Promise<SessionDocumentResponse>;
        },

        deleteDocument: (id: string, documentId: string): Promise<void> =>
            request(`/sessions/${id}/documents/${documentId}`, {
                method: 'DELETE',
            }),

        listDocuments: (id: string): Promise<SessionDocumentsResponse> =>
            request(`/sessions/${id}/documents`),

        delete: (id: string): Promise<void> =>
            request(`/sessions/${id}`, {
                method: 'DELETE',
            }),

        exportJson: (id: string, topic: string, runId?: string | null): Promise<void> => {
            const params = new URLSearchParams({ format: 'json' });
            if (runId) params.set('run_id', runId);
            return download(`/sessions/${id}/export?${params.toString()}`, buildTopicFilename(topic, 'json'));
        },

        exportMarkdown: (id: string, topic: string, categories?: MarkdownExportCategory[], runId?: string | null): Promise<void> => {
            const params = new URLSearchParams({ format: 'markdown' });
            if (runId) params.set('run_id', runId);
            categories?.forEach((category) => params.append('categories', category));
            return download(`/sessions/${id}/export?${params.toString()}`, buildTopicFilename(topic, 'md'));
        },

        exportHtml: (id: string, topic: string, categories?: MarkdownExportCategory[], runId?: string | null): Promise<void> => {
            const params = new URLSearchParams({ format: 'html' });
            if (runId) params.set('run_id', runId);
            categories?.forEach((category) => params.append('categories', category));
            return download(`/sessions/${id}/export?${params.toString()}`, buildTopicFilename(topic, 'html'));
        },

    },

    runs: {
        create: (
            sessionId: string,
            options?: { topic?: string; participants?: string[]; max_turns?: number },
        ): Promise<RunSummary> =>
            request(`/sessions/${sessionId}/runs`, {
                method: 'POST',
                body: JSON.stringify(options ?? {}),
            }),

        get: (runId: string): Promise<RunProjectionResponse> =>
            request(`/runs/${runId}`),

        events: (runId: string, afterSeq = 0): Promise<{ run_id: string; events: RuntimeEvent[] }> =>
            request(`/runs/${runId}/events?after_seq=${afterSeq}`),

        command: (
            runId: string,
            commandType: RunCommandType,
            content?: string,
        ): Promise<RunCommandAck> =>
            request(`/runs/${runId}/commands`, {
                method: 'POST',
                body: JSON.stringify({
                    command_type: commandType,
                    ...(content ? { content } : {}),
                }),
            }),

        pendingCommands: (runId: string): Promise<{ run_id: string; commands: PendingRunCommand[] }> =>
            request(`/runs/${runId}/commands`),

        revokeCommand: (runId: string, commandId: string): Promise<{ revoked: boolean }> =>
            request(`/runs/${runId}/commands/${commandId}`, { method: 'DELETE' }),
    },

    settings: {
        getRuntime: (): Promise<RuntimeSettings> =>
            request('/settings'),

        updateRuntime: (payload: RuntimeSettings): Promise<RuntimeSettings> =>
            request('/settings', {
                method: 'PUT',
                body: JSON.stringify(payload),
            }),
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
            request(`/models/${id}`, {
                method: 'DELETE',
            }),

        probe: (id: string | null, payload: ModelProviderProbePayload): Promise<ModelProviderProbeResult> =>
            request(id ? `/models/${id}/probe` : '/models/probe', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),

        fetchRemoteModels: (id: string | null, payload: ModelProviderProbePayload): Promise<ModelProviderModelsResult> =>
            request(id ? `/models/${id}/models` : '/models/remote-models', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
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
};
