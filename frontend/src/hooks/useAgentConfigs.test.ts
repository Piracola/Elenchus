import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
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
            agentPersonas: {
                ...actual.api.agentPersonas,
                list: vi.fn(),
            },
        },
    };
});

const modelsListMock = vi.mocked(api.models.list);
const personasListMock = vi.mocked(api.agentPersonas.list);

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

const personaFixture = [{
    id: 'persona-1',
    name: 'Analyst',
    description: 'Balanced analyst',
    roles: ['proposer'],
    filename: 'analyst.md',
}];

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useAgentConfigs', () => {
    it('exposes loading state and resolved data on initial load', async () => {
        let resolveModels: ((value: typeof modelFixture) => void) | undefined;
        let resolvePersonas: ((value: typeof personaFixture) => void) | undefined;

        modelsListMock.mockImplementation(() => new Promise((resolve) => {
            resolveModels = resolve;
        }));
        personasListMock.mockImplementation(() => new Promise((resolve) => {
            resolvePersonas = resolve;
        }));

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(true);
        });
        expect(result.current.error).toBeNull();

        await act(async () => {
            resolveModels?.(modelFixture);
            resolvePersonas?.(personaFixture);
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.savedConfigs).toEqual(modelFixture);
        expect(result.current.agentPersonas).toEqual(personaFixture);
        expect(modelsListMock).toHaveBeenCalledTimes(1);
        expect(personasListMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces fetch failures as consumable error state without dropping successful data', async () => {
        modelsListMock.mockResolvedValue(modelFixture);
        personasListMock.mockRejectedValue(new Error('personas failed'));

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe('personas failed');
        expect(result.current.savedConfigs).toEqual(modelFixture);
        expect(result.current.agentPersonas).toEqual([]);
    });

    it('refreshes models only after the config manager closes', async () => {
        modelsListMock
            .mockResolvedValueOnce(modelFixture)
            .mockResolvedValueOnce([{
                ...modelFixture[0],
                id: 'provider-2',
                name: 'Updated Provider',
            }]);
        personasListMock.mockResolvedValue(personaFixture);

        const { result } = renderHook(() => useAgentConfigs());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
            result.current.setShowConfigManager(true);
        });

        expect(modelsListMock).toHaveBeenCalledTimes(1);
        expect(personasListMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            result.current.setShowConfigManager(false);
        });

        await waitFor(() => {
            expect(modelsListMock).toHaveBeenCalledTimes(2);
        });

        expect(personasListMock).toHaveBeenCalledTimes(1);
        expect(result.current.savedConfigs[0]?.id).toBe('provider-2');
    });

    it('keeps personas available if the manager closes before the initial load finishes', async () => {
        let resolveInitialModels: ((value: typeof modelFixture) => void) | undefined;
        let resolveInitialPersonas: ((value: typeof personaFixture) => void) | undefined;
        let resolveRefreshModels: ((value: typeof modelFixture) => void) | undefined;

        modelsListMock
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveInitialModels = resolve;
            }))
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveRefreshModels = resolve;
            }));
        personasListMock.mockImplementationOnce(() => new Promise((resolve) => {
            resolveInitialPersonas = resolve;
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

        await waitFor(() => {
            expect(personasListMock).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            resolveRefreshModels?.([{
                ...modelFixture[0],
                id: 'provider-2',
                name: 'Updated Provider',
            }]);
            resolveInitialModels?.(modelFixture);
            resolveInitialPersonas?.(personaFixture);
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.savedConfigs[0]?.id).toBe('provider-2');
        expect(result.current.agentPersonas).toEqual(personaFixture);
    });
});
