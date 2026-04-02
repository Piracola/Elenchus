import { act, cleanup, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { api } from '../api/client';
import { buildSavePayload, findProviderIndexById, useModelConfigManager } from './useModelConfigManager';
import type { ProviderFormData } from '../types';

vi.mock('../api/client', () => ({
    api: {
        models: {
            list: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

const modelsApi = api.models as {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
};

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function createFormData(overrides: Partial<ProviderFormData> = {}): ProviderFormData {
    return {
        name: 'Custom Provider',
        providerType: 'openai',
        apiKey: '',
        apiKeyConfigured: true,
        clearApiKey: false,
        apiBaseUrl: 'https://example.com/v1',
        defaultMaxTokens: '64000',
        customParametersText: '{"reasoning_effort":"medium"}',
        models: ['gpt-4o'],
        isDefault: false,
        ...overrides,
    };
}

describe('findProviderIndexById', () => {
    it('selects the created provider by id instead of assuming append order', () => {
        expect(findProviderIndexById([
            {
                id: 'provider-new',
                name: 'Newest',
                provider_type: 'openai',
                api_key_configured: true,
                api_base_url: null,
                default_max_tokens: 64000,
                custom_parameters: {},
                models: ['gpt-4o'],
                is_default: true,
                created_at: '2026-03-22T00:00:00Z',
                updated_at: '2026-03-22T00:00:00Z',
            },
            {
                id: 'provider-old',
                name: 'Older',
                provider_type: 'openai',
                api_key_configured: true,
                api_base_url: null,
                default_max_tokens: 64000,
                custom_parameters: {},
                models: ['gpt-4o'],
                is_default: false,
                created_at: '2026-03-21T00:00:00Z',
                updated_at: '2026-03-21T00:00:00Z',
            },
        ], 'provider-new', 1)).toBe(0);
    });

    it('falls back to a clamped active index when the id is missing', () => {
        expect(findProviderIndexById([
            {
                id: 'provider-a',
                name: 'A',
                provider_type: 'openai',
                api_key_configured: false,
                api_base_url: null,
                default_max_tokens: 64000,
                custom_parameters: {},
                models: ['gpt-4o'],
                is_default: false,
                created_at: '2026-03-21T00:00:00Z',
                updated_at: '2026-03-21T00:00:00Z',
            },
        ], 'missing', 4)).toBe(0);
    });
});

describe('useModelConfigManager', () => {
    it('surfaces invalid custom-parameter JSON as a save failure alert', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        modelsApi.list.mockResolvedValue([]);

        const { result } = renderHook(() => useModelConfigManager());

        await act(async () => {
            result.current.startNew();
        });
        await act(async () => {
            result.current.updateFormField('name', 'Broken Provider');
        });
        await act(async () => {
            result.current.updateFormField('customParametersText', '{invalid json');
        });
        await act(async () => {
            await result.current.handleSave();
        });

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('保存失败'));
        expect(modelsApi.create).not.toHaveBeenCalled();
        expect(modelsApi.update).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });
});

describe('buildSavePayload', () => {
    it('preserves an existing secret when the edit form leaves API key blank', () => {
        expect(buildSavePayload(createFormData())).toEqual({
            name: 'Custom Provider',
            provider_type: 'openai',
            api_base_url: 'https://example.com/v1',
            default_max_tokens: 64000,
            custom_parameters: { reasoning_effort: 'medium' },
            models: ['gpt-4o'],
            is_default: false,
        });
    });

    it('sends a replacement secret when a new API key is provided', () => {
        expect(buildSavePayload(createFormData({ apiKey: 'sk-new-secret' }))).toEqual({
            name: 'Custom Provider',
            provider_type: 'openai',
            api_key: 'sk-new-secret',
            api_base_url: 'https://example.com/v1',
            default_max_tokens: 64000,
            custom_parameters: { reasoning_effort: 'medium' },
            models: ['gpt-4o'],
            is_default: false,
        });
    });

    it('sends an explicit clear flag when the user removes the saved secret', () => {
        expect(buildSavePayload(createFormData({ clearApiKey: true }))).toEqual({
            name: 'Custom Provider',
            provider_type: 'openai',
            clear_api_key: true,
            api_base_url: 'https://example.com/v1',
            default_max_tokens: 64000,
            custom_parameters: { reasoning_effort: 'medium' },
            models: ['gpt-4o'],
            is_default: false,
        });
    });
});
