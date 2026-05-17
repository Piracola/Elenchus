import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../api/client';
import type { SearchConfig } from '../../../types';
import { toast } from '../../../utils/chat/toast';
import { __resetSearchConfigStateCacheForTests, useSearchConfigState } from './useSearchConfigState';

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
        provider: 'ddgs',
        available_providers: [
            { name: 'ddgs', available: true, is_primary: true },
            { name: 'searxng', available: true, is_primary: false },
            { name: 'tavily', available: false, is_primary: false },
        ],
        provider_settings: {
            searxng: {
                base_url: 'https://search.example.com',
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
    __resetSearchConfigStateCacheForTests();
});

describe('useSearchConfigState', () => {
    it('reuses cached config on remount while refreshing in the background', async () => {
        const firstConfig = createSearchConfig({
            provider: 'ddgs',
            provider_settings: {
                searxng: {
                    base_url: 'https://search.example.com',
                    api_key_configured: false,
                },
                tavily: {
                    api_url: 'https://api.tavily.com/search',
                    api_key_configured: false,
                },
            },
        });
        const refreshedConfig = createSearchConfig({
            provider: 'tavily',
            provider_settings: {
                searxng: {
                    base_url: 'https://search.example.com',
                    api_key_configured: false,
                },
                tavily: {
                    api_url: 'https://proxy.example.com/tavily',
                    api_key_configured: true,
                },
            },
            available_providers: [
                { name: 'ddgs', available: true, is_primary: false },
                { name: 'searxng', available: true, is_primary: false },
                { name: 'tavily', available: true, is_primary: true },
            ],
        });

        let resolveSecondFetch: ((config: SearchConfig) => void) | null = null;
        searchApi.getConfig
            .mockResolvedValueOnce(firstConfig)
            .mockImplementationOnce(() => new Promise<SearchConfig>((resolve) => {
                resolveSecondFetch = resolve;
            }));

        const firstMount = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(firstMount.result.current.isLoading).toBe(false);
        });
        firstMount.unmount();

        const secondMount = renderHook(() => useSearchConfigState());

        expect(secondMount.result.current.isLoading).toBe(false);
        expect(secondMount.result.current.isRefreshing).toBe(true);
        expect(secondMount.result.current.currentProvider).toBe('ddgs');
        expect(secondMount.result.current.tavilyApiUrl).toBe('https://api.tavily.com/search');

        await act(async () => {
            resolveSecondFetch?.(refreshedConfig);
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(secondMount.result.current.isRefreshing).toBe(false);
        });

        expect(secondMount.result.current.currentProvider).toBe('tavily');
        expect(secondMount.result.current.tavilyApiUrl).toBe('https://proxy.example.com/tavily');
        expect(secondMount.result.current.tavilyApiKeyConfigured).toBe(true);
    });

    it('loads the current search config on mount', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(searchApi.getConfig).toHaveBeenCalledTimes(1);
        expect(result.current.currentProvider).toBe('ddgs');
        expect(result.current.tavilyApiUrl).toBe('https://api.tavily.com/search');
    });

    it('keeps Tavily draft input while a background refresh resolves', async () => {
        searchApi.getConfig.mockResolvedValueOnce(createSearchConfig());

        const firstMount = renderHook(() => useSearchConfigState());
        await waitFor(() => {
            expect(firstMount.result.current.isLoading).toBe(false);
        });
        firstMount.unmount();

        let resolveSecondFetch: ((config: SearchConfig) => void) | null = null;
        searchApi.getConfig.mockImplementationOnce(() => new Promise<SearchConfig>((resolve) => {
            resolveSecondFetch = resolve;
        }));

        const { result } = renderHook(() => useSearchConfigState());

        act(() => {
            result.current.setTavilyApiKey('tvly-draft-key');
            result.current.setTavilyApiUrl('https://draft.example.com/tavily');
        });

        await act(async () => {
            resolveSecondFetch?.(createSearchConfig({
                provider_settings: {
                    searxng: {
                        base_url: 'https://search.example.com',
                        api_key_configured: false,
                    },
                    tavily: {
                        api_url: 'https://api.tavily.com/search',
                        api_key_configured: true,
                    },
                },
            }));
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(result.current.isRefreshing).toBe(false);
        });

        expect(result.current.tavilyApiKey).toBe('tvly-draft-key');
        expect(result.current.tavilyApiUrl).toBe('https://draft.example.com/tavily');
        expect(result.current.tavilyApiKeyConfigured).toBe(true);
    });

    it('saves trimmed SearXNG settings and reapplies the returned config', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.updateConfig.mockResolvedValue(createSearchConfig({
            provider_settings: {
                searxng: {
                    base_url: 'https://proxy.example.com/search',
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
            result.current.setSearxngBaseUrl('  https://proxy.example.com/search  ');
            result.current.setSearxngApiKey('  searxng-secret  ');
        });

        await act(async () => {
            await result.current.handleSaveSearxng();
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: {
                searxng: {
                    base_url: 'https://proxy.example.com/search',
                    api_key: 'searxng-secret',
                },
            },
        });
        expect(result.current.searxngBaseUrl).toBe('https://proxy.example.com/search');
        expect(result.current.searxngApiKey).toBe('');
        expect(result.current.searxngApiKeyConfigured).toBe(true);
        expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('SearXNG'), 'success');
    });

    it('saves trimmed Tavily settings and reapplies the returned config', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.updateConfig.mockResolvedValue(createSearchConfig({
            provider_settings: {
                searxng: {
                    base_url: 'https://search.example.com',
                    api_key_configured: false,
                },
                tavily: {
                    api_url: 'https://proxy.example.com/tavily',
                    api_key_configured: true,
                },
            },
        }));

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        act(() => {
            result.current.setTavilyApiUrl('  https://proxy.example.com/tavily  ');
            result.current.setTavilyApiKey('  tvly-secret  ');
        });

        await act(async () => {
            await result.current.handleSaveTavily();
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: {
                tavily: {
                    api_url: 'https://proxy.example.com/tavily',
                    api_key: 'tvly-secret',
                },
            },
        });
        expect(result.current.tavilyApiUrl).toBe('https://proxy.example.com/tavily');
        expect(result.current.tavilyApiKey).toBe('');
        expect(result.current.tavilyApiKeyConfigured).toBe(true);
        expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('Tavily'), 'success');
    });
});
