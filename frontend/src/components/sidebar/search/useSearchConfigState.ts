import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../api/client';
import type { SearchConfig, SearchProviderStatus, SearchProviderType } from '../../../types';
import { toast } from '../../../utils/chat/toast';
import { PROVIDER_INFO } from './searchConfigShared';

export function useSearchConfigState() {
    const [providers, setProviders] = useState<SearchProviderStatus[]>([]);
    const [currentProvider, setCurrentProvider] = useState<SearchProviderType | string>('');
    const [searxngBaseUrl, setSearxngBaseUrl] = useState('');
    const [searxngApiKey, setSearxngApiKey] = useState('');
    const [searxngApiKeyConfigured, setSearxngApiKeyConfigured] = useState(false);
    const [tavilyApiUrl, setTavilyApiUrl] = useState('');
    const [tavilyApiKey, setTavilyApiKey] = useState('');
    const [tavilyApiKeyConfigured, setTavilyApiKeyConfigured] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isBusy = activeAction !== null;

    const applyConfig = useCallback((config: SearchConfig) => {
        setCurrentProvider(config.provider);
        setProviders(config.available_providers);
        setSearxngBaseUrl(config.provider_settings.searxng.base_url);
        setSearxngApiKey('');
        setSearxngApiKeyConfigured(config.provider_settings.searxng.api_key_configured);
        setTavilyApiUrl(config.provider_settings.tavily.api_url);
        setTavilyApiKey('');
        setTavilyApiKeyConfigured(config.provider_settings.tavily.api_key_configured);
    }, []);

    const fetchConfig = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const config = await api.search.getConfig();
            applyConfig(config);
        } catch (err) {
            const message = err instanceof Error ? err.message : '\u83b7\u53d6\u641c\u7d22\u914d\u7f6e\u5931\u8d25';
            console.error('Failed to fetch search config:', err);
            setError(message);
            toast('\u83b7\u53d6\u641c\u7d22\u914d\u7f6e\u5931\u8d25', 'error');
        } finally {
            setIsLoading(false);
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
            toast(`\u5df2\u5207\u6362\u5230 ${PROVIDER_INFO[providerName].label}`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '\u5207\u6362\u641c\u7d22\u5f15\u64ce\u5931\u8d25';
            console.error('Failed to set provider:', err);
            setError(message);
            toast('\u5207\u6362\u641c\u7d22\u5f15\u64ce\u5931\u8d25', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [currentProvider, fetchConfig, isBusy]);

    const handleSaveSearxng = useCallback(async () => {
        setActiveAction('save:searxng');
        setError(null);

        try {
            const config = await api.search.updateConfig({
                provider_settings: {
                    searxng: {
                        base_url: searxngBaseUrl.trim(),
                        api_key: searxngApiKey.trim() || null,
                    },
                },
            });
            applyConfig(config);
            toast('\u5df2\u4fdd\u5b58 SearXNG \u914d\u7f6e', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '\u4fdd\u5b58 SearXNG \u914d\u7f6e\u5931\u8d25';
            console.error('Failed to save SearXNG config:', err);
            setError(message);
            toast('\u4fdd\u5b58 SearXNG \u914d\u7f6e\u5931\u8d25', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig, searxngApiKey, searxngBaseUrl]);

    const handleSaveTavily = useCallback(async () => {
        setActiveAction('save:tavily');
        setError(null);

        try {
            const config = await api.search.updateConfig({
                provider_settings: {
                    tavily: {
                        api_url: tavilyApiUrl.trim(),
                        api_key: tavilyApiKey.trim() || null,
                    },
                },
            });
            applyConfig(config);
            toast('\u5df2\u4fdd\u5b58 Tavily \u914d\u7f6e', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '\u4fdd\u5b58 Tavily \u914d\u7f6e\u5931\u8d25';
            console.error('Failed to save Tavily config:', err);
            setError(message);
            toast('\u4fdd\u5b58 Tavily \u914d\u7f6e\u5931\u8d25', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig, tavilyApiKey, tavilyApiUrl]);

    const handleClearKey = useCallback(async (providerName: 'searxng' | 'tavily') => {
        setActiveAction(`clear:${providerName}`);
        setError(null);

        try {
            const config = await api.search.updateConfig({
                provider_settings: {
                    [providerName]: {
                        clear_api_key: true,
                    },
                },
            });
            applyConfig(config);
            toast(
                providerName === 'searxng'
                    ? '\u5df2\u6e05\u9664 SearXNG API Key'
                    : '\u5df2\u6e05\u9664 Tavily API Key',
                'success',
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : '\u6e05\u9664 API Key \u5931\u8d25';
            console.error('Failed to clear provider key:', err);
            setError(message);
            toast('\u6e05\u9664 API Key \u5931\u8d25', 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig]);

    return {
        providers,
        currentProvider,
        searxngBaseUrl,
        setSearxngBaseUrl,
        searxngApiKey,
        setSearxngApiKey,
        searxngApiKeyConfigured,
        tavilyApiUrl,
        setTavilyApiUrl,
        tavilyApiKey,
        setTavilyApiKey,
        tavilyApiKeyConfigured,
        isLoading,
        isBusy,
        activeAction,
        error,
        handleProviderChange,
        handleSaveSearxng,
        handleSaveTavily,
        handleClearKey,
    };
}
