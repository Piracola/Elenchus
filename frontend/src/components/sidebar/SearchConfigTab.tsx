import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search } from 'lucide-react';

import { SearchProviderSelector } from './search/SearchProviderSelector';
import { SearchProviderSettingsCard } from './search/SearchProviderSettingsCard';
import { getProviderLabel } from './search/searchConfigShared';
import { useSearchConfigState } from './search/useSearchConfigState';
import {
    SettingsBadge,
    SettingsNotice,
    SettingsPage,
    SettingsSection,
} from './settings/SettingsPrimitives';

function SearchConfigSkeleton() {
    return (
        <div className="settings-skeleton">
            {[0, 1, 2].map((index) => (
                <motion.div
                    key={index}
                    className="settings-skeleton-block"
                    animate={{ opacity: [0.58, 0.92, 0.58] }}
                    transition={{
                        duration: 1.1,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: 'easeInOut',
                        delay: index * 0.08,
                    }}
                >
                    <div className="settings-skeleton-line" style={{ width: '32%' }} />
                    <div className="settings-skeleton-line" style={{ width: '84%' }} />
                    <div className="settings-skeleton-line" style={{ width: '62%' }} />
                </motion.div>
            ))}
        </div>
    );
}

export function SearchConfigTab() {
    const {
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
        isRefreshing,
        isBusy,
        activeAction,
        error,
        handleProviderChange,
        handleSaveSearxng,
        handleSaveTavily,
        handleClearKey,
    } = useSearchConfigState();

    return (
        <SettingsPage
            title="搜索引擎配置"
            description="切换当前搜索引擎，并配置可选的外部搜索 API。"
        >
            <AnimatePresence initial={false}>
                {isRefreshing && !isLoading && (
                    <motion.div
                        key="search-refreshing-banner"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16 }}
                    >
                        <SettingsNotice tone="info" icon={<RefreshCw size={15} />}>
                            正在同步最新搜索配置...
                        </SettingsNotice>
                    </motion.div>
                )}
            </AnimatePresence>

            {error && !isLoading && (
                <SettingsNotice tone="error">{error}</SettingsNotice>
            )}

            {isLoading ? (
                <SearchConfigSkeleton />
            ) : (
                <>
                    <SettingsSection
                        title="当前引擎"
                        description="选择系统优先使用的搜索 provider。不可用的 provider 会保持禁用。"
                        icon={<Search size={15} />}
                    >
                        <SearchProviderSelector
                            providers={providers}
                            currentProvider={currentProvider}
                            activeAction={activeAction}
                            isBusy={isBusy}
                            onProviderChange={(providerName) => {
                                void handleProviderChange(providerName);
                            }}
                        />

                        <div className="settings-search-status">
                            <div className="settings-control-row">
                                <span className="settings-field-label" style={{ marginBottom: 0 }}>
                                    当前使用
                                </span>
                                <SettingsBadge tone="accent">{getProviderLabel(currentProvider)}</SettingsBadge>
                            </div>
                            <div className="settings-field-hint" style={{ marginTop: 0 }}>
                                如果当前引擎不可用，系统会自动尝试回退到其他可用搜索引擎。
                            </div>
                        </div>
                    </SettingsSection>

                    <SearchProviderSettingsCard
                        title="SearXNG"
                        description="可以接入你自己的 SearXNG 实例，配置 Base URL 和 API Key。"
                        fields={[
                            {
                                label: 'Base URL',
                                value: searxngBaseUrl,
                                onChange: (event) => setSearxngBaseUrl(event.target.value),
                                placeholder: 'http://localhost:8080',
                                helperText: '留空后保存会重置为默认地址 http://localhost:8080。',
                            },
                            {
                                label: 'API Key',
                                type: 'password',
                                autoComplete: 'off',
                                value: searxngApiKey,
                                onChange: (event) => setSearxngApiKey(event.target.value),
                                placeholder: searxngApiKeyConfigured ? '留空则保持已保存的 Key' : '可选',
                                helperText: searxngApiKeyConfigured
                                    ? '已保存 SearXNG API Key，如无需替换可保持为空。'
                                    : '如果实例在网关、反向代理或鉴权层后面，可以在这里填写 API Key。',
                            },
                        ]}
                        onSave={() => {
                            void handleSaveSearxng();
                        }}
                        isBusy={isBusy}
                        activeAction={activeAction}
                        saveActionId="save:searxng"
                        saveIdleLabel="保存 SearXNG"
                        saveBusyLabel="保存中..."
                        showClearButton={searxngApiKeyConfigured}
                        onClear={() => {
                            void handleClearKey('searxng');
                        }}
                        clearActionId="clear:searxng"
                        clearIdleLabel="清除已保存 Key"
                        clearBusyLabel="清除中..."
                    />

                    <SearchProviderSettingsCard
                        title="DDGS"
                        description="项目内置的轻量搜索 provider，无需 Docker、独立服务或 API Key。"
                        fields={[]}
                        onSave={() => {}}
                        isBusy={false}
                        activeAction={null}
                        saveActionId="noop:ddgs"
                        saveIdleLabel=""
                        saveBusyLabel=""
                    />

                    <SearchProviderSettingsCard
                        title="Tavily"
                        description="可配置 Tavily API Key，也可在代理或自建转发场景下替换 API URL。"
                        fields={[
                            {
                                label: 'API URL',
                                value: tavilyApiUrl,
                                onChange: (event) => setTavilyApiUrl(event.target.value),
                                placeholder: 'https://api.tavily.com/search',
                                helperText: '留空后保存会重置为默认 Tavily 接口地址。',
                            },
                            {
                                label: 'API Key',
                                type: 'password',
                                autoComplete: 'off',
                                value: tavilyApiKey,
                                onChange: (event) => setTavilyApiKey(event.target.value),
                                placeholder: tavilyApiKeyConfigured ? '留空则保持已保存的 Key' : 'tvly-...',
                                helperText: tavilyApiKeyConfigured
                                    ? '已保存 Tavily API Key。如果不需要替换，可以保持为空。'
                                    : '配置 Tavily API Key 后，Tavily provider 才会被标记为可用。',
                            },
                        ]}
                        onSave={() => {
                            void handleSaveTavily();
                        }}
                        isBusy={isBusy}
                        activeAction={activeAction}
                        saveActionId="save:tavily"
                        saveIdleLabel="保存 Tavily"
                        saveBusyLabel="保存中..."
                        showClearButton={tavilyApiKeyConfigured}
                        onClear={() => {
                            void handleClearKey('tavily');
                        }}
                        clearActionId="clear:tavily"
                        clearIdleLabel="清除已保存 Key"
                        clearBusyLabel="清除中..."
                    />
                </>
            )}
        </SettingsPage>
    );
}
