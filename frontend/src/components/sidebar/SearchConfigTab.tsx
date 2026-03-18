import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';

type ProviderType = 'duckduckgo' | 'searxng' | 'tavily';

interface ProviderInfo {
    name: ProviderType;
    available: boolean;
    is_primary: boolean;
}

const PROVIDER_INFO: Record<ProviderType, { label: string; description: string }> = {
    duckduckgo: {
        label: 'DuckDuckGo',
        description: '默认搜索引擎，无需额外配置，开箱即用。',
    },
    searxng: {
        label: 'SearXNG',
        description: '适合自托管部署，可将搜索流量保留在自己的服务内。',
    },
    tavily: {
        label: 'Tavily',
        description: '面向 AI 场景的搜索 API，需要配置 Tavily API Key。',
    },
};

export function SearchConfigTab() {
    const [providers, setProviders] = useState<ProviderInfo[]>([]);
    const [currentProvider, setCurrentProvider] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSwitching, setIsSwitching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchConfig = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const config = await api.search.getConfig();
            setCurrentProvider(config.provider);
            setProviders(config.available_providers as ProviderInfo[]);
        } catch (err) {
            const message = err instanceof Error ? err.message : '获取搜索配置失败';
            console.error('Failed to fetch search config:', err);
            setError(message);
            toast('获取搜索配置失败', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void fetchConfig();
    }, []);

    const handleProviderChange = async (providerName: ProviderType) => {
        if (providerName === currentProvider || isSwitching) return;

        setIsSwitching(true);
        setError(null);

        try {
            await api.search.setProvider(providerName);
            setCurrentProvider(providerName);
            await fetchConfig();
            toast(`已切换到 ${PROVIDER_INFO[providerName].label}`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : '切换搜索引擎失败';
            console.error('Failed to set provider:', err);
            setError(message);
            toast('切换搜索引擎失败', 'error');
        } finally {
            setIsSwitching(false);
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
                <div
                    style={{
                        fontSize: '14px',
                        color: 'var(--text-muted)',
                    }}
                >
                    正在加载搜索配置...
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
                    搜索引擎配置
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                    选择用于联网搜索的引擎。系统会自动检测可用性，并在当前引擎不可用时尝试回退。
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
                {(Object.keys(PROVIDER_INFO) as ProviderType[]).map((providerKey) => {
                    const provider = providers.find((item) => item.name === providerKey);
                    const info = PROVIDER_INFO[providerKey];
                    const isSelected = currentProvider === providerKey;
                    const isAvailable = provider?.available ?? false;

                    return (
                        <motion.div
                            key={providerKey}
                            whileHover={isAvailable ? { scale: 1.01 } : {}}
                            onClick={() => {
                                if (isAvailable) {
                                    void handleProviderChange(providerKey);
                                }
                            }}
                            style={{
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-lg)',
                                background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                                border: `1px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
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
                                            不可用
                                        </span>
                                    )}
                                </div>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        color: 'var(--text-muted)',
                                        marginTop: '4px',
                                    }}
                                >
                                    {info.description}
                                </div>
                            </div>

                            {isSwitching && isSelected && (
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'var(--accent-indigo)',
                                    }}
                                >
                                    切换中...
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            <div
                style={{
                    marginTop: '28px',
                    padding: '16px 20px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-inner)',
                }}
            >
                <div
                    style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                        marginBottom: '8px',
                    }}
                >
                    当前状态
                </div>
                <div
                    style={{
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                    }}
                >
                    当前使用：
                    <strong style={{ color: 'var(--text-primary)' }}>
                        {' '}
                        {PROVIDER_INFO[currentProvider as ProviderType]?.label || currentProvider || '未设置'}
                    </strong>
                </div>
                <div
                    style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginTop: '8px',
                    }}
                >
                    提示：如果当前引擎暂时不可用，系统会自动尝试切换到其它可用搜索引擎。
                </div>
            </div>
        </div>
    );
}
