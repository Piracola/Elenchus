import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { ModelConfig, ProviderFormData } from '../types';

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
        models: [],
        isDefault: false,
    });
    const [newModelInput, setNewModelInput] = useState('');

    const getActiveIndexClamped = useCallback((len: number, idx: number) => {
        if (len === 0) return 0;
        return Math.min(idx, len - 1);
    }, []);

    const fillForm = useCallback((p: ModelConfig) => {
        setFormData({
            name: p.name,
            providerType: p.provider_type || 'openai',
            apiKey: p.api_key || '',
            apiBaseUrl: p.api_base_url || '',
            models: p.models || [],
            isDefault: p.is_default || false,
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
                const p = data[getActiveIndexClamped(data.length, activeIndex)];
                fillForm(p);
            } else if (data.length === 0) {
                startNew();
            }
        } catch (err) {
            console.error("Failed to load providers", err);
        } finally {
            setIsLoading(false);
        }
    }, [activeIndex, isCreatingNew, getActiveIndexClamped, fillForm, startNew]);

    const handleSelectProvider = useCallback((idx: number) => {
        setIsCreatingNew(false);
        setActiveIndex(idx);
        fillForm(providers[idx]);
    }, [providers, fillForm]);

    const handleDeleteProvider = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("确定要删除这个提供商配置吗？")) return;
        try {
            await api.models.delete(id);
            fetchConfigs();
        } catch (err) {
            console.error("Delete failed", err);
        }
    }, [fetchConfigs]);

    const handleSave = useCallback(async () => {
        if (!formData.name.trim()) {
            alert("提供商名称为必填项。");
            return;
        }

        const payload = {
            name: formData.name.trim(),
            provider_type: formData.providerType,
            api_key: formData.apiKey.trim() || null,
            api_base_url: formData.apiBaseUrl.trim() || null,
            models: formData.models,
            is_default: formData.isDefault,
        };

        try {
            if (isCreatingNew) {
                await api.models.create(payload);
                setIsCreatingNew(false);
                await fetchConfigs();
                setActiveIndex(providers.length);
            } else {
                const currentId = providers[activeIndex].id;
                await api.models.update(currentId, payload);
                await fetchConfigs();
            }
        } catch (err) {
            console.error("Save failed", err);
            alert(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
        }
    }, [formData, isCreatingNew, providers, activeIndex, fetchConfigs]);

    const handleAddModel = useCallback(() => {
        if (!newModelInput.trim()) return;
        if (!formData.models.includes(newModelInput.trim())) {
            setFormData(prev => ({ ...prev, models: [...prev.models, newModelInput.trim()] }));
        }
        setNewModelInput('');
    }, [newModelInput, formData.models]);

    const handleRemoveModel = useCallback((mod: string) => {
        setFormData(prev => ({ ...prev, models: prev.models.filter(m => m !== mod) }));
    }, []);

    const updateFormField = useCallback(<K extends keyof ProviderFormData>(field: K, value: ProviderFormData[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
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
