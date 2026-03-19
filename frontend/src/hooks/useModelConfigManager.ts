import { useCallback, useState } from 'react';

import { api } from '../api/client';
import type { ModelConfig, ProviderFormData } from '../types';
import { formatCustomParameters, parseCustomParametersInput } from '../utils/customParameters';

export function useModelConfigManager() {
    const [providers, setProviders] = useState<ModelConfig[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [formData, setFormData] = useState<ProviderFormData>({
        name: '',
        providerType: 'openai',
        apiKey: '',
        apiBaseUrl: '',
        customParametersText: '',
        models: [],
        isDefault: false,
    });
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
            apiKey: provider.api_key || '',
            apiBaseUrl: provider.api_base_url || '',
            customParametersText: formatCustomParameters(provider.custom_parameters),
            models: provider.models || [],
            isDefault: provider.is_default || false,
        });
        setIsCreatingNew(false);
    }, []);

    const startNew = useCallback(() => {
        setIsCreatingNew(true);
        setFormData({
            name: '',
            providerType: 'openai',
            apiKey: '',
            apiBaseUrl: '',
            customParametersText: '',
            models: [],
            isDefault: false,
        });
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

        const payload = {
            name: formData.name.trim(),
            provider_type: formData.providerType,
            api_key: formData.apiKey.trim() || null,
            api_base_url: formData.apiBaseUrl.trim() || null,
            custom_parameters: parseCustomParametersInput(formData.customParametersText),
            models: formData.models,
            is_default: formData.isDefault,
        };

        try {
            if (isCreatingNew) {
                await api.models.create(payload);
                setIsCreatingNew(false);
                await fetchConfigs();
                setActiveIndex(providers.length);
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
    }, [activeIndex, fetchConfigs, formData, isCreatingNew, providers]);

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
        setFormData((previous) => ({ ...previous, [field]: value }));
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
