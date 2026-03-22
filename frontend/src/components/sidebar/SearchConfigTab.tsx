import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';

import { api } from '../../api/client';
import type { SearchConfig, SearchProviderStatus, SearchProviderType } from '../../types';
import { toast } from '../../utils/toast';

const PROVIDER_INFO: Record<SearchProviderType, { label: string; description: string }> = {
    duckduckgo: {
        label: 'DuckDuckGo',
        description: '\u9ed8\u8ba4\u641c\u7d22\u5f15\u64ce\uff0c\u65e0\u9700\u989d\u5916\u914d\u7f6e\uff0c\u5f00\u7bb1\u5373\u7528\u3002',
    },
    searxng: {
        label: 'SearXNG',
        description: '\u9002\u5408\u81ea\u6258\u7ba1\u90e8\u7f72\uff0c\u53ef\u4ee5\u914d\u7f6e\u81ea\u5b9a\u4e49 Base URL \u548c\u53ef\u9009 API Key\u3002',
    },
    tavily: {
        label: 'Tavily',
        description: '\u9762\u5411 AI \u573a\u666f\u7684\u641c\u7d22 API\uff0c\u652f\u6301\u81ea\u5b9a\u4e49 API Key \u548c API URL\u3002',
    },
};

const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '12px',
    marginBottom: '6px',
    color: 'var(--text-secondary)',
    fontWeight: 600,
};

const helperTextStyle: CSSProperties = {
    marginTop: '6px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
};

function getProviderLabel(provider: SearchProviderType | string): string {
    if (provider in PROVIDER_INFO) {
        return PROVIDER_INFO[provider as SearchProviderType].label;
    }
    return provider || '\u672a\u8bbe\u7f6e';
}

export function SearchConfigTab() {
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

    const applyConfig = (config: SearchConfig) => {
        setCurrentProvider(config.provider);
        setProviders(config.available_providers);
        setSearxngBaseUrl(config.provider_settings.searxng.base_url);
        setSearxngApiKey('');
        setSearxngApiKeyConfigured(config.provider_settings.searxng.api_key_configured);
        setTavilyApiUrl(config.provider_settings.tavily.api_url);
        setTavilyApiKey('');
        setTavilyApiKeyConfigured(config.provider_settings.tavily.api_key_configured);
    };

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
    }, []);

    useEffect(() => {
        void fetchConfig();
    }, [fetchConfig]);

    const handleProviderChange = async (providerName: SearchProviderType) => {
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
    };

    const handleSaveSearxng = async () => {
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
    };

    const handleSaveTavily = async () => {
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
    };

    const handleClearKey = async (providerName: 'searxng' | 'tavily') => {
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
    };

    if (isLoading) {
        return (
            <div
                style={{
                    padding: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                }}
            >
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    {'\u6b63\u5728\u52a0\u8f7d\u641c\u7d22\u914d\u7f6e...'}
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                padding: '24px',
                overflowY: 'auto',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xs)',
            }}
        >
            <div
                style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: '20px',
                    marginBottom: '24px',
                }}
            >
                <h3
                    style={{
                        fontSize: '20px',
                        margin: '0 0 8px',
                        color: 'var(--text-primary)',
                        fontWeight: 700,
                    }}
                >
                    {'\u641c\u7d22\u5f15\u64ce\u914d\u7f6e'}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {'\u53ef\u4ee5\u5728\u8fd9\u91cc\u5207\u6362\u5f53\u524d\u641c\u7d22\u5f15\u64ce\uff0c\u5e76\u7ef4\u62a4 SearXNG / Tavily \u7684\u8fd0\u884c\u65f6\u53c2\u6570\u3002'}
                </p>
            </div>

            {error && (
                <div
                    style={{
                        padding: '12px 16px',
                        background: 'var(--color-red-50)',
                        border: '1px solid var(--color-red-200)',
                        borderRadius: 'var(--radius-lg)',
                        marginBottom: '16px',
                        color: 'var(--color-red-700)',
                        fontSize: '13px',
                    }}
                >
                    {error}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(Object.keys(PROVIDER_INFO) as SearchProviderType[]).map((providerKey) => {
                    const provider = providers.find((item) => item.name === providerKey);
                    const info = PROVIDER_INFO[providerKey];
                    const isSelected = currentProvider === providerKey;
                    const isAvailable = provider?.available ?? false;
                    const isSwitching = activeAction === `provider:${providerKey}`;

                    return (
                        <motion.div
                            key={providerKey}
                            whileHover={isAvailable && !isBusy ? { scale: 1.01 } : {}}
                            onClick={() => {
                                if (isAvailable && !isBusy) {
                                    void handleProviderChange(providerKey);
                                }
                            }}
                            style={{
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-lg)',
                                background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                                border: `1px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                                cursor: isAvailable && !isBusy ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                transition: 'all var(--transition-fast)',
                                boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                                opacity: isAvailable ? 1 : 0.6,
                            }}
                        >
                            <div
                                style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    border: `2px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                {isSelected && (
                                    <div
                                        style={{
                                            width: '10px',
                                            height: '10px',
                                            borderRadius: '50%',
                                            background: 'var(--accent-indigo)',
                                        }}
                                    />
                                )}
                            </div>

                            <div style={{ flex: 1 }}>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        fontSize: '15px',
                                        color: 'var(--text-primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    {info.label}
                                    {!isAvailable && (
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                padding: '2px 8px',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-sm)',
                                                color: 'var(--text-muted)',
                                                fontWeight: 500,
                                            }}
                                        >
                                            {'\u4e0d\u53ef\u7528'}
                                        </span>
                                    )}
                                </div>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        color: 'var(--text-muted)',
                                        marginTop: '4px',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {info.description}
                                </div>
                            </div>

                            {isSwitching && (
                                <div style={{ fontSize: '12px', color: 'var(--accent-indigo)' }}>
                                    {'\u5207\u6362\u4e2d...'}
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            <div
                style={{
                    marginTop: '28px',
                    display: 'grid',
                    gap: '16px',
                }}
            >
                <div
                    style={{
                        padding: '18px 20px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-inner)',
                    }}
                >
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                        {'\u5f53\u524d\u72b6\u6001'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {'\u5f53\u524d\u4f7f\u7528\uff1a'}
                        <strong style={{ color: 'var(--text-primary)' }}> {getProviderLabel(currentProvider)}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                        {'\u63d0\u793a\uff1a\u5982\u679c\u5f53\u524d\u5f15\u64ce\u4e0d\u53ef\u7528\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u5c1d\u8bd5\u56de\u9000\u5230\u5176\u4ed6\u53ef\u7528\u641c\u7d22\u5f15\u64ce\u3002'}
                    </div>
                </div>

                <div
                    style={{
                        padding: '20px',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-card)',
                        boxShadow: 'var(--shadow-xs)',
                    }}
                >
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700 }}>
                            {'SearXNG'}
                        </div>
                        <div style={{ ...helperTextStyle, marginTop: '4px' }}>
                            {'\u53ef\u4ee5\u8bbe\u7f6e\u81ea\u5efa SearXNG \u5b9e\u4f8b\u5730\u5740\uff0c\u5e76\u4e3a\u53d7\u4fdd\u62a4\u7684\u7f51\u5173\u4fdd\u5b58 API Key\u3002'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '14px' }}>
                        <div>
                            <label style={labelStyle}>{'Base URL'}</label>
                            <input
                                type="text"
                                value={searxngBaseUrl}
                                onChange={(event) => setSearxngBaseUrl(event.target.value)}
                                placeholder="http://localhost:8080"
                                style={inputStyle}
                            />
                            <div style={helperTextStyle}>
                                {'\u7559\u7a7a\u540e\u4fdd\u5b58\u4f1a\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u503c http://localhost:8080\u3002'}
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>{'API Key'}</label>
                            <input
                                type="password"
                                autoComplete="off"
                                value={searxngApiKey}
                                onChange={(event) => setSearxngApiKey(event.target.value)}
                                placeholder={searxngApiKeyConfigured ? '\u7559\u7a7a\u5219\u4fdd\u6301\u5df2\u4fdd\u5b58\u7684 Key' : '\u53ef\u9009'}
                                style={inputStyle}
                            />
                            <div style={helperTextStyle}>
                                {searxngApiKeyConfigured
                                    ? '\u5df2\u4fdd\u5b58 SearXNG API Key\u3002\u5982\u679c\u4e0d\u9700\u8981\u66ff\u6362\uff0c\u53ef\u4ee5\u76f4\u63a5\u4fdd\u6301\u4e3a\u7a7a\u3002'
                                    : '\u5982\u679c\u4f60\u7684 SearXNG \u90e8\u7f72\u5728\u4ee3\u7406\u6216\u7f51\u5173\u540e\u9762\uff0c\u53ef\u4ee5\u5728\u8fd9\u91cc\u586b\u5199 API Key\u3002'}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => void handleSaveSearxng()}
                            disabled={isBusy}
                            style={{
                                padding: '10px 16px',
                                background: 'var(--text-primary)',
                                color: 'var(--bg-primary)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: 600,
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                opacity: isBusy ? 0.7 : 1,
                            }}
                        >
                            {activeAction === 'save:searxng' ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58 SearXNG'}
                        </button>

                        {searxngApiKeyConfigured && (
                            <button
                                onClick={() => void handleClearKey('searxng')}
                                disabled={isBusy}
                                style={{
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    fontWeight: 600,
                                    cursor: isBusy ? 'not-allowed' : 'pointer',
                                    opacity: isBusy ? 0.7 : 1,
                                }}
                            >
                                {activeAction === 'clear:searxng' ? '\u6e05\u9664\u4e2d...' : '\u6e05\u9664\u5df2\u4fdd\u5b58 Key'}
                            </button>
                        )}
                    </div>
                </div>

                <div
                    style={{
                        padding: '20px',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-card)',
                        boxShadow: 'var(--shadow-xs)',
                    }}
                >
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700 }}>
                            {'Tavily'}
                        </div>
                        <div style={{ ...helperTextStyle, marginTop: '4px' }}>
                            {'\u53ef\u4ee5\u914d\u7f6e Tavily API Key\uff0c\u4e5f\u53ef\u4ee5\u5728\u6709\u4ee3\u7406\u6216\u81ea\u5efa\u8f6c\u53d1\u7aef\u7684\u573a\u666f\u4e0b\u66ff\u6362 API URL\u3002'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '14px' }}>
                        <div>
                            <label style={labelStyle}>{'API URL'}</label>
                            <input
                                type="text"
                                value={tavilyApiUrl}
                                onChange={(event) => setTavilyApiUrl(event.target.value)}
                                placeholder="https://api.tavily.com/search"
                                style={inputStyle}
                            />
                            <div style={helperTextStyle}>
                                {'\u7559\u7a7a\u540e\u4fdd\u5b58\u4f1a\u91cd\u7f6e\u4e3a\u9ed8\u8ba4 Tavily \u63a5\u53e3\u5730\u5740\u3002'}
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>{'API Key'}</label>
                            <input
                                type="password"
                                autoComplete="off"
                                value={tavilyApiKey}
                                onChange={(event) => setTavilyApiKey(event.target.value)}
                                placeholder={tavilyApiKeyConfigured ? '\u7559\u7a7a\u5219\u4fdd\u6301\u5df2\u4fdd\u5b58\u7684 Key' : 'tvly-...'}
                                style={inputStyle}
                            />
                            <div style={helperTextStyle}>
                                {tavilyApiKeyConfigured
                                    ? '\u5df2\u4fdd\u5b58 Tavily API Key\u3002\u5982\u679c\u4e0d\u9700\u8981\u66ff\u6362\uff0c\u53ef\u4ee5\u4fdd\u6301\u4e3a\u7a7a\u3002'
                                    : '\u914d\u7f6e Tavily API Key \u540e\uff0cTavily \u63d0\u4f9b\u5668\u624d\u4f1a\u88ab\u6807\u8bb0\u4e3a\u53ef\u7528\u3002'}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => void handleSaveTavily()}
                            disabled={isBusy}
                            style={{
                                padding: '10px 16px',
                                background: 'var(--text-primary)',
                                color: 'var(--bg-primary)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: 600,
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                opacity: isBusy ? 0.7 : 1,
                            }}
                        >
                            {activeAction === 'save:tavily' ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58 Tavily'}
                        </button>

                        {tavilyApiKeyConfigured && (
                            <button
                                onClick={() => void handleClearKey('tavily')}
                                disabled={isBusy}
                                style={{
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    fontWeight: 600,
                                    cursor: isBusy ? 'not-allowed' : 'pointer',
                                    opacity: isBusy ? 0.7 : 1,
                                }}
                            >
                                {activeAction === 'clear:tavily' ? '\u6e05\u9664\u4e2d...' : '\u6e05\u9664\u5df2\u4fdd\u5b58 Key'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
