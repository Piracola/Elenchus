import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../api/client';
import type {
    SearchConfig,
    SearchProviderDescriptor,
    SearchProviderType,
} from '../../../types';
import { toast } from '../../../utils/chat/toast';

/** Per-provider, per-field draft values keyed by provider name. */
export type ProviderDrafts = Record<string, Record<string, string>>;

let cachedSearchConfig: SearchConfig | null = null;

export function __resetSearchConfigStateCacheForTests() {
    cachedSearchConfig = null;
}

/** Non-secret values come from the server; secrets always start blank. */
function draftsFromConfig(config: SearchConfig): ProviderDrafts {
    const drafts: ProviderDrafts = {};
    for (const provider of config.providers) {
        drafts[provider.name] = {};
        for (const field of provider.fields) {
            drafts[provider.name][field.key] = field.secret ? '' : field.value;
        }
    }
    return drafts;
}

function providerLabelOf(config: SearchConfig | null, name: string): string {
    return config?.providers.find((provider) => provider.name === name)?.label ?? name;
}

export function useSearchConfigState() {
    const [providers, setProviders] = useState<SearchProviderDescriptor[]>(
        () => cachedSearchConfig?.providers ?? [],
    );
    const [currentProvider, setCurrentProvider] = useState<SearchProviderType>(
        () => cachedSearchConfig?.provider ?? '',
    );
    const [maxResultsPerQuery, setMaxResultsPerQuery] = useState(
        () => cachedSearchConfig?.max_results_per_query ?? 5,
    );
    const [drafts, setDrafts] = useState<ProviderDrafts>(
        () => (cachedSearchConfig ? draftsFromConfig(cachedSearchConfig) : {}),
    );
    const [isLoading, setIsLoading] = useState(() => cachedSearchConfig === null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Provider names the user has typed into; background refreshes leave them alone. */
    const editedProvidersRef = useRef<Set<string>>(new Set());

    const isBusy = activeAction !== null;

    const applyConfig = useCallback((config: SearchConfig, options?: { resetProvider?: string }) => {
        cachedSearchConfig = config;
        setCurrentProvider(config.provider);
        setProviders(config.providers);
        setMaxResultsPerQuery(config.max_results_per_query);
        if (options?.resetProvider) {
            editedProvidersRef.current.delete(options.resetProvider);
        }
        const serverDrafts = draftsFromConfig(config);
        setDrafts((previous) => {
            const merged: ProviderDrafts = { ...serverDrafts };
            // Preserve in-progress edits so a background refresh cannot wipe them.
            for (const providerName of editedProvidersRef.current) {
                if (previous[providerName]) {
                    merged[providerName] = { ...serverDrafts[providerName], ...previous[providerName] };
                }
            }
            return merged;
        });
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

    const setFieldValue = useCallback((providerName: string, fieldKey: string, value: string) => {
        editedProvidersRef.current.add(providerName);
        setDrafts((previous) => ({
            ...previous,
            [providerName]: { ...(previous[providerName] ?? {}), [fieldKey]: value },
        }));
    }, []);

    const handleProviderChange = useCallback(async (providerName: SearchProviderType) => {
        if (providerName === currentProvider || isBusy) {
            return;
        }

        setActiveAction(`provider:${providerName}`);
        setError(null);

        try {
            await api.search.setProvider(providerName);
            await fetchConfig();
            toast(`已切换到 ${providerLabelOf(cachedSearchConfig, providerName)}`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '切换搜索引擎失败';
            console.error('Failed to set provider:', err);
            setError(message);
            toast(message, 'error');
        } finally {
            setActiveAction(null);
        }
    }, [currentProvider, fetchConfig, isBusy]);

    const handleSaveProvider = useCallback(async (providerName: string) => {
        const descriptor = providers.find((provider) => provider.name === providerName);
        if (!descriptor) return;

        setActiveAction(`save:${providerName}`);
        setError(null);

        // Send only what the user actually filled in: a blank secret means
        // "keep the stored one", so it must be omitted rather than sent empty.
        const updates: Record<string, string | null> = {};
        for (const field of descriptor.fields) {
            const value = (drafts[providerName]?.[field.key] ?? '').trim();
            if (field.secret && !value) continue;
            updates[field.key] = value;
        }

        try {
            const config = await api.search.updateConfig({
                provider_settings: { [providerName]: updates },
            });
            applyConfig(config, { resetProvider: providerName });
            toast(`已保存 ${descriptor.label} 配置`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '保存搜索配置失败';
            console.error('Failed to save search provider config:', err);
            setError(message);
            toast(message, 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig, drafts, providers]);

    const handleClearSecret = useCallback(async (providerName: string, fieldKey: string) => {
        setActiveAction(`clear:${providerName}:${fieldKey}`);
        setError(null);

        try {
            const config = await api.search.updateConfig({
                provider_settings: { [providerName]: { [fieldKey]: '' } },
            });
            applyConfig(config, { resetProvider: providerName });
            toast('已清除已保存的密钥', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '清除密钥失败';
            console.error('Failed to clear search provider secret:', err);
            setError(message);
            toast(message, 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig]);

    const handleSaveMaxResults = useCallback(async (value: number) => {
        setActiveAction('save:max-results');
        setError(null);

        try {
            const config = await api.search.updateConfig({ max_results_per_query: value });
            applyConfig(config);
            toast('已更新单次检索结果数', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '更新检索结果数失败';
            console.error('Failed to save max results per query:', err);
            setError(message);
            toast(message, 'error');
        } finally {
            setActiveAction(null);
        }
    }, [applyConfig]);

    return {
        providers,
        currentProvider,
        maxResultsPerQuery,
        setMaxResultsPerQuery,
        drafts,
        setFieldValue,
        isLoading,
        isRefreshing,
        isBusy,
        activeAction,
        error,
        handleProviderChange,
        handleSaveProvider,
        handleClearSecret,
        handleSaveMaxResults,
    };
}
