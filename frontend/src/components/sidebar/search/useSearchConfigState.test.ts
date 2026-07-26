import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../api/client';
import type { SearchConfig, SearchProviderDescriptor } from '../../../types';
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

function tavily(overrides: Partial<SearchProviderDescriptor> = {}): SearchProviderDescriptor {
    return {
        name: 'tavily',
        label: 'Tavily',
        description: 'Tavily 检索 API',
        available: false,
        is_primary: false,
        configured: false,
        fields: [
            {
                key: 'api_key',
                label: 'API Key',
                type: 'password',
                placeholder: 'tvly-...',
                helper_text: '在控制台创建。',
                secret: true,
                required: true,
                value: '',
                configured: false,
            },
        ],
        ...overrides,
    };
}

function custom(overrides: Partial<SearchProviderDescriptor> = {}): SearchProviderDescriptor {
    return {
        name: 'custom',
        label: '自定义接口',
        description: '自建 HTTP 搜索桥接',
        available: true,
        is_primary: false,
        configured: true,
        fields: [
            {
                key: 'endpoint',
                label: 'Endpoint',
                type: 'text',
                placeholder: 'https://search.example.com/query',
                helper_text: '优先 POST JSON。',
                secret: false,
                required: true,
                value: 'https://saved.example.com/query',
                configured: true,
            },
            {
                key: 'api_key',
                label: 'API Key',
                type: 'password',
                placeholder: '可选',
                helper_text: 'Bearer 方式发送。',
                secret: true,
                required: false,
                value: '',
                configured: false,
            },
        ],
        ...overrides,
    };
}

function ddgs(overrides: Partial<SearchProviderDescriptor> = {}): SearchProviderDescriptor {
    return {
        name: 'ddgs',
        label: 'DDGS',
        description: '内置兜底搜索',
        available: true,
        is_primary: true,
        configured: true,
        fields: [],
        ...overrides,
    };
}

function createSearchConfig(overrides: Partial<SearchConfig> = {}): SearchConfig {
    return {
        provider: 'ddgs',
        max_results_per_query: 5,
        providers: [tavily(), custom(), ddgs()],
        ...overrides,
    };
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    __resetSearchConfigStateCacheForTests();
});

describe('useSearchConfigState', () => {
    it('seeds drafts from the backend field descriptors', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        // Non-secret values are prefilled; secrets always start blank.
        expect(result.current.drafts.custom.endpoint).toBe('https://saved.example.com/query');
        expect(result.current.drafts.custom.api_key).toBe('');
        expect(result.current.drafts.tavily.api_key).toBe('');
        expect(result.current.providers.map((provider) => provider.name)).toEqual([
            'tavily',
            'custom',
            'ddgs',
        ]);
        expect(result.current.maxResultsPerQuery).toBe(5);
    });

    it('reuses the cached config on remount and refreshes in the background', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        const first = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(first.result.current.isLoading).toBe(false));
        first.unmount();

        let resolveSecond: ((config: SearchConfig) => void) | undefined;
        searchApi.getConfig.mockReturnValue(
            new Promise<SearchConfig>((resolve) => {
                resolveSecond = resolve;
            }),
        );

        const second = renderHook(() => useSearchConfigState());
        expect(second.result.current.isLoading).toBe(false);
        expect(second.result.current.isRefreshing).toBe(true);
        expect(second.result.current.currentProvider).toBe('ddgs');

        await act(async () => {
            resolveSecond?.(createSearchConfig({ provider: 'custom' }));
        });

        await waitFor(() => expect(second.result.current.isRefreshing).toBe(false));
        expect(second.result.current.currentProvider).toBe('custom');
    });

    it('keeps a provider draft while a background refresh resolves', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        const first = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(first.result.current.isLoading).toBe(false));
        first.unmount();

        let resolveSecond: ((config: SearchConfig) => void) | undefined;
        searchApi.getConfig.mockReturnValue(
            new Promise<SearchConfig>((resolve) => {
                resolveSecond = resolve;
            }),
        );
        const { result } = renderHook(() => useSearchConfigState());

        act(() => {
            result.current.setFieldValue('tavily', 'api_key', 'typing-tvly');
        });

        await act(async () => {
            resolveSecond?.(createSearchConfig({ provider: 'custom' }));
        });

        await waitFor(() => expect(result.current.isRefreshing).toBe(false));
        // The in-progress edit survives; untouched providers take server values.
        expect(result.current.drafts.tavily.api_key).toBe('typing-tvly');
        expect(result.current.drafts.custom.endpoint).toBe('https://saved.example.com/query');
    });

    it('omits a blank secret on save so the stored key is kept', async () => {
        searchApi.getConfig.mockResolvedValue(
            createSearchConfig({
                providers: [
                    custom({
                        fields: custom().fields.map((field) =>
                            field.key === 'api_key' ? { ...field, configured: true } : field,
                        ),
                    }),
                ],
            }),
        );
        searchApi.updateConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
            result.current.setFieldValue('custom', 'endpoint', '  https://new.example.com/q  ');
        });
        await act(async () => {
            await result.current.handleSaveProvider('custom');
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: { custom: { endpoint: 'https://new.example.com/q' } },
        });
    });

    it('sends a filled secret and trims it', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig({ providers: [tavily()] }));
        searchApi.updateConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
            result.current.setFieldValue('tavily', 'api_key', '  tvly-abc  ');
        });
        await act(async () => {
            await result.current.handleSaveProvider('tavily');
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: { tavily: { api_key: 'tvly-abc' } },
        });
    });

    it('clears a stored secret with an explicit empty value', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.updateConfig.mockResolvedValue(createSearchConfig());

        const { result } = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleClearSecret('tavily', 'api_key');
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({
            provider_settings: { tavily: { api_key: '' } },
        });
    });

    it('switches provider and reports the label from the server payload', async () => {
        searchApi.getConfig
            .mockResolvedValueOnce(createSearchConfig())
            .mockResolvedValueOnce(createSearchConfig({ provider: 'custom' }));
        searchApi.setProvider.mockResolvedValue({ status: 'ok', provider: 'custom' });

        const { result } = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleProviderChange('custom');
        });

        expect(searchApi.setProvider).toHaveBeenCalledWith('custom');
        expect(result.current.currentProvider).toBe('custom');
        expect(toastMock).toHaveBeenCalledWith('已切换到 自定义接口', 'success');
    });

    it('surfaces the backend message when switching fails', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.setProvider.mockRejectedValue(new Error('必填项尚未配置'));

        const { result } = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleProviderChange('tavily');
        });

        expect(result.current.error).toBe('必填项尚未配置');
        expect(toastMock).toHaveBeenCalledWith('必填项尚未配置', 'error');
    });

    it('saves the results-per-query limit', async () => {
        searchApi.getConfig.mockResolvedValue(createSearchConfig());
        searchApi.updateConfig.mockResolvedValue(
            createSearchConfig({ max_results_per_query: 8 }),
        );

        const { result } = renderHook(() => useSearchConfigState());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleSaveMaxResults(8);
        });

        expect(searchApi.updateConfig).toHaveBeenCalledWith({ max_results_per_query: 8 });
        expect(result.current.maxResultsPerQuery).toBe(8);
    });
});
