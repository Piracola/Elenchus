import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../api/client';
import type { SearchConfig, SearchProviderStatus, SearchProviderType } from '../../../types';
import { toast } from '../../../utils/chat/toast';
import { PROVIDER_INFO } from './searchConfigShared';

let cachedSearchConfig: SearchConfig | null = null;

export function __resetSearchConfigStateCacheForTests() {
    cachedSearchConfig = null;
}

export function useSearchConfigState() {
    const [providers, setProviders] = useState<SearchProviderStatus[]>(
        () => cachedSearchConfig?.available_providers ?? [],
    );
    const [currentProvider, setCurrentProvider] = useState<SearchProviderType | string>(
        () => cachedSearchConfig?.provider ?? '',
    );
    const [customEndpoint, setCustomEndpoint] = useState(
        () => cachedSearchConfig?.provider_settings.custom.endpoint ?? '',
    );
    const [customApiKey, setCustomApiKey] = useState('');
    const [customApiKeyConfigured, setCustomApiKeyConfigured] = useState(
        () => cachedSearchConfig?.provider_settings.custom.api_key_configured ?? false,
    );
    const [isLoading, setIsLoading] = useState(() => cachedSearchConfig === null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const isEditingCustomRef = useRef(false);

    const isBusy = activeAction !== null;

    const applyConfig = useCallback((config: SearchConfig, options?: { forceCustom?: boolean }) => {
        cachedSearchConfig = config;
        setCurrentProvider(config.provider);
        setProviders(config.available_providers);
        if (options?.forceCustom || !isEditingCustomRef.current) {
            setCustomEndpoint(config.provider_settings.custom.endpoint);
            setCustomApiKey('');
        }
        setCustomApiKeyConfigured(config.provider_settings.custom.api_key_configured);
    }, []);

    const fetchConfig = useCallback(async (options?: { background?: boolean }) => {
        const useBackgroundRefresh = options?.background ?? cachedSearchConfig !== null;

        if (useBackgroundRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const config = await api.search.getConfig();
            applyConfig(config);
        } catch (err) {
            const message = err instanceof Error ? err.message : '获取搜索配置失败';
            console.error('Failed to fetch search config:', err);
            setError(message);
            if (!useBackgroundRefresh) {
                toast('获取搜索配置失败', 'error');
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [applyConfig]);

    useEffect(() => {
        void fetchConfig();
    }, [fetchConfig]);

    const handleProviderChange = useCallback(async (providerName: SearchProviderType) => {
        if (providerName === currentProvider || isBusy) {
            return;
        }

        setActiveAction(`provider:${providerName}`);
        setError(null);

        try {
            await api.search.setProvider(providerName);
            await fetchConfig();
            toast(`已切换到 ${PROVIDER_INFO[providerName].label}`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '切换搜索引擎失败';
            console.error('Failed to set provider:', err);
            setError(message);
            toast('切换搜索引擎失败', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [currentProvider, fetchConfig, isBusy]);

    const handleSaveCustom = useCallback(async () => {
        setActiveAction('save:custom');
        setError(null);

        try {
            const config = await api.search.updateConfig({
                provider_settings: {
                    custom: {
                        endpoint: customEndpoint.trim(),
                        api_key: customApiKey.trim() || null,
                    },
                },
            });
            isEditingCustomRef.current = false;
            applyConfig(config, { forceCustom: true });
            toast('已保存自定义搜索配置', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '保存自定义搜索配置失败';
            console.error('Failed to save custom search config:', err);
            setError(message);
            toast('保存自定义搜索配置失败', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig, customApiKey, customEndpoint]);

    const handleClearCustomKey = useCallback(async () => {
        setActiveAction('clear:custom');
        setError(null);

        try {
            const config = await api.search.updateConfig({
                provider_settings: {
                    custom: {
                        clear_api_key: true,
                    },
                },
            });
            isEditingCustomRef.current = false;
            applyConfig(config, { forceCustom: true });
            toast('已清除自定义搜索 API Key', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '清除 API Key 失败';
            console.error('Failed to clear custom search key:', err);
            setError(message);
            toast('清除 API Key 失败', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig]);

    return {
        providers,
        currentProvider,
        customEndpoint,
        setCustomEndpoint: (value: string) => {
            isEditingCustomRef.current = true;
            setCustomEndpoint(value);
        },
        customApiKey,
        setCustomApiKey: (value: string) => {
            isEditingCustomRef.current = true;
            setCustomApiKey(value);
        },
        customApiKeyConfigured,
        isLoading,
        isRefreshing,
        isBusy,
        activeAction,
        error,
        handleProviderChange,
        handleSaveCustom,
        handleClearCustomKey,
    };
}
