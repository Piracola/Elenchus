import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import { notifyModelConfigsChanged } from '../utils/agent/modelConfigEvents';
import { useAgentConfigs } from './useAgentConfigs';

vi.mock('../api/client', async () => {
    const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
    return {
        ...actual,
        api: {
            ...actual.api,
            models: {
                ...actual.api.models,
                list: vi.fn(),
            },
        },
    };
});

const modelsListMock = vi.mocked(api.models.list);

const modelFixture = [{
    id: 'provider-1',
    name: 'Default Provider',
    provider_type: 'openai',
    api_key_configured: true,
    api_base_url: null,
    default_max_tokens: 64000,
    custom_parameters: {},
    models: ['gpt-4o'],
    is_default: true,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
}];

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useAgentConfigs', () => {
    it('exposes loading state and resolved model configs on initial load', async () => {
        let resolveModels: ((value: typeof modelFixture) => void) | undefined;

        modelsListMock.mockImplementation(() => new Promise((resolve) => {
            resolveModels = resolve;
        }));

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(true);
        });
        expect(result.current.error).toBeNull();

        await act(async () => {
            resolveModels?.(modelFixture);
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.savedConfigs).toEqual(modelFixture);
        expect(modelsListMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces model fetch failures as consumable error state', async () => {
        modelsListMock.mockRejectedValue(new Error('models failed'));

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe('models failed');
        expect(result.current.savedConfigs).toEqual([]);
    });

    it('refreshes models after the config manager closes', async () => {
        modelsListMock
            .mockResolvedValueOnce(modelFixture)
            .mockResolvedValueOnce([{
                ...modelFixture[0],
                id: 'provider-2',
                name: 'Updated Provider',
            }]);

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
            result.current.setShowConfigManager(true);
        });

        expect(modelsListMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            result.current.setShowConfigManager(false);
        });

        await waitFor(() => {
            expect(modelsListMock).toHaveBeenCalledTimes(2);
        });

        expect(result.current.savedConfigs[0]?.id).toBe('provider-2');
    });

    it('refreshes models when provider settings change elsewhere', async () => {
        modelsListMock
            .mockResolvedValueOnce(modelFixture)
            .mockResolvedValueOnce([{
                ...modelFixture[0],
                models: ['gpt-4o', 'gpt-4.1'],
            }]);

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
            notifyModelConfigsChanged();
        });

        await waitFor(() => {
            expect(modelsListMock).toHaveBeenCalledTimes(2);
        });

        expect(result.current.savedConfigs[0]?.models).toEqual(['gpt-4o', 'gpt-4.1']);
    });

    it('keeps the latest model refresh when requests overlap', async () => {
        let resolveInitialModels: ((value: typeof modelFixture) => void) | undefined;
        let resolveRefreshModels: ((value: typeof modelFixture) => void) | undefined;

        modelsListMock
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveInitialModels = resolve;
            }))
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveRefreshModels = resolve;
            }));

        const { result } = renderHook(() => useAgentConfigs());

        await act(async () => {
            result.current.setShowConfigManager(true);
        });

        await act(async () => {
            result.current.setShowConfigManager(false);
        });

        await waitFor(() => {
            expect(modelsListMock).toHaveBeenCalledTimes(2);
        });

        await act(async () => {
            resolveRefreshModels?.([{
                ...modelFixture[0],
                id: 'provider-2',
                name: 'Updated Provider',
            }]);
            resolveInitialModels?.(modelFixture);
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.savedConfigs[0]?.id).toBe('provider-2');
    });
});
