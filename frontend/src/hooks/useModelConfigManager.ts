import { useCallback, useState } from 'react';

import { api } from '../api/client';
import type { ModelConfig, ModelConfigCreatePayload, ProviderFormData } from '../types';
import { formatCustomParameters, parseCustomParametersInput } from '../utils/customParameters';

function createEmptyFormData(): ProviderFormData {
    return {
        name: '',
        providerType: 'openai',
        apiKey: '',
        apiKeyConfigured: false,
        clearApiKey: false,
        apiBaseUrl: '',
        defaultMaxTokens: '64000',
        customParametersText: '',
        models: [],
        isDefault: false,
    };
}

function parseDefaultMaxTokensInput(input: string): number {
    const trimmed = input.trim();
    if (!trimmed) {
        return 64000;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('默认 max_tokens 必须是大于 0 的数字。');
    }
    return Math.floor(parsed);
}

function buildSavePayload(formData: ProviderFormData): ModelConfigCreatePayload {
    const payload: ModelConfigCreatePayload = {
        name: formData.name.trim(),
        provider_type: formData.providerType,
        api_base_url: formData.apiBaseUrl.trim() || null,
        default_max_tokens: parseDefaultMaxTokensInput(formData.defaultMaxTokens),
        custom_parameters: parseCustomParametersInput(formData.customParametersText),
        models: formData.models,
        is_default: formData.isDefault,
    };

    const nextApiKey = formData.apiKey.trim();
    if (nextApiKey) {
        payload.api_key = nextApiKey;
    } else if (formData.clearApiKey) {
        payload.clear_api_key = true;
    }

    return payload;
}

function findProviderIndexById(
    providers: ModelConfig[],
    providerId: string | null,
    fallbackIndex = 0,
): number {
    if (providers.length === 0) {
        return 0;
    }

    if (providerId) {
        const providerIndex = providers.findIndex((provider) => provider.id === providerId);
        if (providerIndex >= 0) {
            return providerIndex;
        }
    }

    return Math.min(Math.max(fallbackIndex, 0), providers.length - 1);
}

export function useModelConfigManager() {
    const [providers, setProviders] = useState<ModelConfig[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [formData, setFormData] = useState<ProviderFormData>(createEmptyFormData);
    const [newModelInput, setNewModelInput] = useState('');

    const getActiveIndexClamped = useCallback((length: number, index: number) => {
        if (length === 0) {
            return 0;
        }
        return Math.min(index, length - 1);
    }, []);

    const fillForm = useCallback((provider: ModelConfig) => {
        setFormData({
            name: provider.name,
            providerType: provider.provider_type || 'openai',
            apiKey: '',
            apiKeyConfigured: provider.api_key_configured || false,
            clearApiKey: false,
            apiBaseUrl: provider.api_base_url || '',
            defaultMaxTokens: String(provider.default_max_tokens ?? 64000),
            customParametersText: formatCustomParameters(provider.custom_parameters),
            models: provider.models || [],
            isDefault: provider.is_default || false,
        });
        setIsCreatingNew(false);
    }, []);

    const startNew = useCallback(() => {
        setIsCreatingNew(true);
        setFormData(createEmptyFormData());
    }, []);

    const fetchConfigs = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.models.list();
            setProviders(data);

            if (data.length > 0 && !isCreatingNew) {
                const provider = data[getActiveIndexClamped(data.length, activeIndex)];
                fillForm(provider);
            } else if (data.length === 0) {
                startNew();
            }
        } catch (err) {
            console.error('Failed to load providers', err);
        } finally {
            setIsLoading(false);
        }
    }, [activeIndex, fillForm, getActiveIndexClamped, isCreatingNew, startNew]);

    const handleSelectProvider = useCallback((index: number) => {
        setIsCreatingNew(false);
        setActiveIndex(index);
        fillForm(providers[index]);
    }, [fillForm, providers]);

    const handleDeleteProvider = useCallback(async (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!confirm('确定要删除这个提供商配置吗？')) {
            return;
        }

        try {
            await api.models.delete(id);
            await fetchConfigs();
        } catch (err) {
            console.error('Delete failed', err);
        }
    }, [fetchConfigs]);

    const handleSave = useCallback(async () => {
        if (!formData.name.trim()) {
            alert('提供商名称为必填项。');
            return;
        }

        try {
            const payload = buildSavePayload(formData);

            if (isCreatingNew) {
                const created = await api.models.create(payload);
                const nextProviders = await api.models.list();
                setProviders(nextProviders);

                if (nextProviders.length === 0) {
                    startNew();
                    return;
                }

                const nextActiveIndex = findProviderIndexById(nextProviders, created.id, activeIndex);
                setActiveIndex(nextActiveIndex);
                fillForm(nextProviders[nextActiveIndex]);
                return;
            }

            const currentId = providers[activeIndex]?.id;
            if (!currentId) {
                throw new Error('未找到当前提供商配置。');
            }
            await api.models.update(currentId, payload);
            await fetchConfigs();
        } catch (err) {
            console.error('Save failed', err);
            alert(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
        }
    }, [activeIndex, fetchConfigs, fillForm, formData, isCreatingNew, providers, startNew]);

    const handleAddModel = useCallback(() => {
        const nextModel = newModelInput.trim();
        if (!nextModel) {
            return;
        }

        if (!formData.models.includes(nextModel)) {
            setFormData((previous) => ({
                ...previous,
                models: [...previous.models, nextModel],
            }));
        }
        setNewModelInput('');
    }, [formData.models, newModelInput]);

    const handleRemoveModel = useCallback((model: string) => {
        setFormData((previous) => ({
            ...previous,
            models: previous.models.filter((item) => item !== model),
        }));
    }, []);

    const updateFormField = useCallback(<K extends keyof ProviderFormData>(
        field: K,
        value: ProviderFormData[K],
    ) => {
        setFormData((previous) => {
            if (field === 'apiKey') {
                const nextApiKey = String(value);
                return {
                    ...previous,
                    apiKey: nextApiKey,
                    clearApiKey: nextApiKey.trim() ? false : previous.clearApiKey,
                };
            }
            return { ...previous, [field]: value };
        });
    }, []);

    return {
        providers,
        isLoading,
        activeIndex,
        isCreatingNew,
        formData,
        newModelInput,
        setNewModelInput,
        fetchConfigs,
        handleSelectProvider,
        handleDeleteProvider,
        handleSave,
        handleAddModel,
        handleRemoveModel,
        updateFormField,
        startNew,
    };
}

export { buildSavePayload, createEmptyFormData, findProviderIndexById };
