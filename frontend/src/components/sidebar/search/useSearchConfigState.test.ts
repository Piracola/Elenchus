import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../api/client';
import type { SearchConfig } from '../../../types';
import { toast } from '../../../utils/chat/toast';
import { useSearchConfigState } from './useSearchConfigState';

vi.mock('../../../api/client', () => ({
    api: {
        search: {
            getConfig: vi.fn(),
            setProvider: vi.fn(),
            updateConfig: vi.fn(),
        },
    },
}));

vi.mock('../../../utils/chat/toast', () => ({
    toast: vi.fn(),
}));

const searchApi = vi.mocked(api.search);
const toastMock = vi.mocked(toast);

function createSearchConfig(overrides: Partial<SearchConfig> = {}): SearchConfig {
    return {
        provider: 'duckduckgo',
        available_providers: [
            { name: 'duckduckgo', available: true, is_primary: true },
            { name: 'searxng', available: true, is_primary: false },
            { name: 'tavily', available: false, is_primary: false },
        ],
        provider_settings: {
            searxng: {
                base_url: 'http://localhost:8080',
                api_key_configured: false,
            },
            tavily: {
                api_url: 'https://api.tavily.com/search',
                api_key_configured: false,
            },
        },
        ...overrides,
    } satisfies SearchConfig;
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useSearchConfigState', () => {
    it('loads the current search config on mount', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(searchApi.getConfig).toHaveBeenCalledTimes(1);
        expect(result.current.currentProvider).toBe('duckduckgo');
        expect(result.current.searxngBaseUrl).toBe('http://localhost:8080');
        expect(result.current.tavilyApiUrl).toBe('https://api.tavily.com/search');
    });

    it('saves trimmed SearXNG settings and reapplies the returned config', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.updateConfig.mockResolvedValue(createSearchConfig({
            provider_settings: {
                searxng: {
                    base_url: 'https://search.example.com',
                    api_key_configured: true,
                },
                tavily: {
                    api_url: 'https://api.tavily.com/search',
                    api_key_configured: false,
                },
            },
        }));

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        act(() => {
            result.current.setSearxngBaseUrl('  https://search.example.com  ');
            result.current.setSearxngApiKey('  secret-key  ');
        });

        await act(async () => {
            await result.current.handleSaveSearxng();
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: {
                searxng: {
                    base_url: 'https://search.example.com',
                    api_key: 'secret-key',
                },
            },
        });
        expect(result.current.searxngBaseUrl).toBe('https://search.example.com');
        expect(result.current.searxngApiKey).toBe('');
        expect(result.current.searxngApiKeyConfigured).toBe(true);
        expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('SearXNG'), 'success');
    });
});
