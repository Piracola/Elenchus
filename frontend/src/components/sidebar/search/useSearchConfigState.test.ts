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
            { name: 'custom', available: false, is_primary: false },
        ],
        provider_settings: {
            custom: {
                endpoint: 'https://search.example.com/query',
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
        const firstConfig = createSearchConfig();
        const refreshedConfig = createSearchConfig({
            provider: 'custom',
            provider_settings: {
                custom: {
                    endpoint: 'https://proxy.example.com/search',
                    api_key_configured: true,
                },
            },
            available_providers: [
                { name: 'ddgs', available: true, is_primary: false },
                { name: 'custom', available: true, is_primary: true },
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
        expect(secondMount.result.current.customEndpoint).toBe('https://search.example.com/query');

        await act(async () => {
            resolveSecondFetch?.(refreshedConfig);
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(secondMount.result.current.isRefreshing).toBe(false);
        });

        expect(secondMount.result.current.currentProvider).toBe('custom');
        expect(secondMount.result.current.customEndpoint).toBe('https://proxy.example.com/search');
        expect(secondMount.result.current.customApiKeyConfigured).toBe(true);
    });

    it('loads the current search config on mount', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(searchApi.getConfig).toHaveBeenCalledTimes(1);
        expect(result.current.currentProvider).toBe('ddgs');
        expect(result.current.customEndpoint).toBe('https://search.example.com/query');
    });

    it('keeps custom draft input while a background refresh resolves', async () => {
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
            result.current.setCustomApiKey('custom-draft-key');
            result.current.setCustomEndpoint('https://draft.example.com/search');
        });

        await act(async () => {
            resolveSecondFetch?.(createSearchConfig({
                provider_settings: {
                    custom: {
                        endpoint: 'https://search.example.com/query',
                        api_key_configured: true,
                    },
                },
            }));
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(result.current.isRefreshing).toBe(false);
        });

        expect(result.current.customApiKey).toBe('custom-draft-key');
        expect(result.current.customEndpoint).toBe('https://draft.example.com/search');
        expect(result.current.customApiKeyConfigured).toBe(true);
    });

    it('saves trimmed custom settings and reapplies the returned config', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.updateConfig.mockResolvedValue(createSearchConfig({
            provider_settings: {
                custom: {
                    endpoint: 'https://proxy.example.com/search',
                    api_key_configured: true,
                },
            },
        }));

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        act(() => {
            result.current.setCustomEndpoint('  https://proxy.example.com/search  ');
            result.current.setCustomApiKey('  custom-secret  ');
        });

        await act(async () => {
            await result.current.handleSaveCustom();
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: {
                custom: {
                    endpoint: 'https://proxy.example.com/search',
                    api_key: 'custom-secret',
                },
            },
        });
        expect(result.current.customEndpoint).toBe('https://proxy.example.com/search');
        expect(result.current.customApiKey).toBe('');
        expect(result.current.customApiKeyConfigured).toBe(true);
        expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('自定义搜索'), 'success');
    });
});
