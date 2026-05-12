import { useCallback, useState } from 'react';

import { api } from '../api/client';
import { toast } from '../utils/chat/toast';
import type { ModelConfig, ModelConfigCreatePayload, ProviderFormData, RemoteModelCandidate } from '../types';
import { formatCustomParameters, parseCustomParametersInput } from '../utils/agent/customParameters';

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
        enableThinking: false,
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

function normalizeModelList(models: string[]): string[] {
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function createRemoteModelCandidates(
    currentModels: string[],
    remoteModels: string[],
): RemoteModelCandidate[] {
    const currentSet = new Set(normalizeModelList(currentModels));
    return normalizeModelList(remoteModels).map((model) => ({
        id: model,
        name: model,
        added: currentSet.has(model),
    }));
}

function buildSavePayload(formData: ProviderFormData): ModelConfigCreatePayload {
    // 解析自定义参数
    const customParams = parseCustomParametersInput(formData.customParametersText);
    // 将 enable_thinking 合并到 custom_parameters 中
    if (formData.enableThinking) {
        customParams.enable_thinking = true;
    } else {
        // 如果未启用思考模式，从 custom_parameters 中移除 enable_thinking
        delete customParams.enable_thinking;
    }

    const payload: ModelConfigCreatePayload = {
        name: formData.name.trim(),
        provider_type: formData.providerType,
        api_base_url: formData.apiBaseUrl.trim() || null,
        default_max_tokens: parseDefaultMaxTokensInput(formData.defaultMaxTokens),
        custom_parameters: customParams,
        models: normalizeModelList(formData.models),
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
    const [isProbing, setIsProbing] = useState(false);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [probeMessage, setProbeMessage] = useState('');
    const [probeStatus, setProbeStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [formData, setFormData] = useState<ProviderFormData>(createEmptyFormData);
    const [newModelInput, setNewModelInput] = useState('');
    const [remoteModelCandidates, setRemoteModelCandidates] = useState<RemoteModelCandidate[]>([]);

    const getActiveIndexClamped = useCallback((length: number, index: number) => {
        if (length === 0) {
            return 0;
        }
        return Math.min(index, length - 1);
    }, []);

    const fillForm = useCallback((provider: ModelConfig) => {
        // 从 custom_parameters 中提取 enable_thinking
        const customParams = provider.custom_parameters || {};
        const enableThinking = Boolean(customParams.enable_thinking);
        // 从 custom_parameters 中移除 enable_thinking，避免在原始参数文本中重复显示
        const filteredCustomParams = Object.fromEntries(
            Object.entries(customParams).filter(([key]) => key !== 'enable_thinking')
        );

        setFormData({
            name: provider.name,
            providerType: provider.provider_type || 'openai',
            apiKey: '',
            apiKeyConfigured: provider.api_key_configured || false,
            clearApiKey: false,
            apiBaseUrl: provider.api_base_url || '',
            defaultMaxTokens: String(provider.default_max_tokens ?? 64000),
            customParametersText: formatCustomParameters(filteredCustomParams),
            models: provider.models || [],
            isDefault: provider.is_default || false,
            enableThinking,
        });
        setIsCreatingNew(false);
        setProbeMessage('');
        setProbeStatus('idle');
        setRemoteModelCandidates([]);
    }, []);

    const startNew = useCallback(() => {
        setIsCreatingNew(true);
        setFormData(createEmptyFormData());
        setProbeMessage('');
        setProbeStatus('idle');
        setRemoteModelCandidates([]);
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
        if (normalizeModelList(formData.models).length === 0) {
            alert('请至少添加一个模型标识。');
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
            setRemoteModelCandidates((previous) => previous.map((candidate) => (
                candidate.name === nextModel
                    ? { ...candidate, added: true }
                    : candidate
            )));
        }
        setNewModelInput('');
    }, [formData.models, newModelInput]);

    const handleRemoveModel = useCallback((model: string) => {
        setFormData((previous) => ({
            ...previous,
            models: previous.models.filter((item) => item !== model),
        }));
        setRemoteModelCandidates((previous) => previous.map((candidate) => (
            candidate.name === model
                ? { ...candidate, added: false }
                : candidate
        )));
    }, []);

    const updateFormField = useCallback(<K extends keyof ProviderFormData>(
        field: K,
        value: ProviderFormData[K],
    ) => {
        if (field === 'providerType' || field === 'apiKey' || field === 'apiBaseUrl') {
            setProbeMessage('');
            setProbeStatus('idle');
        }
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

    const getCurrentProviderId = useCallback(() => {
        if (isCreatingNew) {
            return null;
        }
        return providers[activeIndex]?.id ?? null;
    }, [activeIndex, isCreatingNew, providers]);

    const buildProbePayload = useCallback(() => ({
        provider_type: formData.providerType,
        api_key: formData.apiKey.trim() || null,
        api_base_url: formData.apiBaseUrl.trim(),
    }), [formData.apiBaseUrl, formData.apiKey, formData.providerType]);

    const handleProbeProvider = useCallback(async () => {
        const providerId = getCurrentProviderId();
        if (!formData.apiKey.trim() && (!formData.apiKeyConfigured || formData.clearApiKey)) {
            const message = '请先填写 API 密钥。';
            setProbeMessage(message);
            setProbeStatus('error');
            toast(message, 'error');
            return;
        }

        try {
            setIsProbing(true);
            setProbeMessage('正在检测连接...');
            setProbeStatus('idle');
            const result = await api.models.probe(providerId, buildProbePayload());
            setProbeMessage(result.message);
            setProbeStatus(result.ok ? 'success' : 'error');
            toast(result.message, result.ok ? 'success' : 'error');
        } catch (err) {
            const message = err instanceof Error ? err.message : '检测失败。';
            setProbeMessage(message);
            setProbeStatus('error');
            toast(message, 'error');
        } finally {
            setIsProbing(false);
        }
    }, [buildProbePayload, formData.apiKey, formData.apiKeyConfigured, formData.clearApiKey, getCurrentProviderId]);

    const handleFetchRemoteModels = useCallback(async () => {
        const providerId = getCurrentProviderId();
        if (!formData.apiKey.trim() && (!formData.apiKeyConfigured || formData.clearApiKey)) {
            const message = '请先填写 API 密钥。';
            setProbeMessage(message);
            setProbeStatus('error');
            toast(message, 'error');
            return;
        }

        try {
            setIsFetchingModels(true);
            setProbeMessage('正在获取模型列表...');
            setProbeStatus('idle');
            const result = await api.models.fetchRemoteModels(providerId, buildProbePayload());
            const nextCandidates = createRemoteModelCandidates(formData.models, result.models);
            setRemoteModelCandidates(nextCandidates);
            const existingCount = nextCandidates.filter((candidate) => candidate.added).length;
            const message = existingCount > 0
                ? `已获取 ${nextCandidates.length} 个模型，其中 ${existingCount} 个已在当前配置中。`
                : `已获取 ${nextCandidates.length} 个模型，请选择要加入配置的模型。`;
            setProbeMessage(message);
            setProbeStatus('success');
            toast(message, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '获取模型列表失败。';
            setProbeMessage(message);
            setProbeStatus('error');
            toast(message, 'error');
        } finally {
            setIsFetchingModels(false);
        }
    }, [buildProbePayload, formData.apiKey, formData.apiKeyConfigured, formData.clearApiKey, formData.models, getCurrentProviderId]);

    const handleAddRemoteModel = useCallback((model: string) => {
        const normalizedModel = model.trim();
        if (!normalizedModel) {
            return;
        }

        setFormData((previous) => {
            const nextModels = normalizeModelList([...previous.models, normalizedModel]);
            if (nextModels.length === previous.models.length) {
                return previous;
            }

            return {
                ...previous,
                models: nextModels,
            };
        });
        setRemoteModelCandidates((previous) => previous.map((candidate) => (
            candidate.name === normalizedModel
                ? { ...candidate, added: true }
                : candidate
        )));
    }, []);

    return {
        providers,
        isLoading,
        isProbing,
        isFetchingModels,
        probeMessage,
        probeStatus,
        activeIndex,
        isCreatingNew,
        formData,
        newModelInput,
        remoteModelCandidates,
        setNewModelInput,
        fetchConfigs,
        handleSelectProvider,
        handleDeleteProvider,
        handleSave,
        handleAddModel,
        handleRemoveModel,
        handleProbeProvider,
        handleFetchRemoteModels,
        handleAddRemoteModel,
        updateFormField,
        startNew,
    };
}

export { buildSavePayload, createEmptyFormData, createRemoteModelCandidates, findProviderIndexById };
