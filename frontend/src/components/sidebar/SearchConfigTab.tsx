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
        customEndpoint,
        setCustomEndpoint,
        customApiKey,
        setCustomApiKey,
        customApiKeyConfigured,
        isLoading,
        isRefreshing,
        isBusy,
        activeAction,
        error,
        handleProviderChange,
        handleSaveCustom,
        handleClearCustomKey,
    } = useSearchConfigState();

    return (
        <SettingsPage
            title="搜索引擎配置"
            description="保留内置 DDGS，并提供一个薄自定义接口用于接入外部搜索服务。"
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
                                自定义接口未配置或不可用时，系统会回退到 DDGS。
                            </div>
                        </div>
                    </SettingsSection>

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
                        title="自定义搜索接口"
                        description="用于接入自建搜索桥接服务。接口需返回 results、items 或 data 数组。"
                        fields={[
                            {
                                label: 'Endpoint',
                                value: customEndpoint,
                                onChange: (event) => setCustomEndpoint(event.target.value),
                                placeholder: 'https://search.example.com/query',
                                helperText: '后端会优先 POST JSON，若接口返回 405 则尝试 GET 查询参数。',
                            },
                            {
                                label: 'API Key',
                                type: 'password',
                                autoComplete: 'off',
                                value: customApiKey,
                                onChange: (event) => setCustomApiKey(event.target.value),
                                placeholder: customApiKeyConfigured ? '留空则保持已保存的 Key' : '可选',
                                helperText: customApiKeyConfigured
                                    ? '已保存 API Key。如果不需要替换，可以保持为空。'
                                    : '填写后会以 Bearer Token 方式发送。',
                            },
                        ]}
                        onSave={() => {
                            void handleSaveCustom();
                        }}
                        isBusy={isBusy}
                        activeAction={activeAction}
                        saveActionId="save:custom"
                        saveIdleLabel="保存自定义接口"
                        saveBusyLabel="保存中..."
                        showClearButton={customApiKeyConfigured}
                        onClear={() => {
                            void handleClearCustomKey();
                        }}
                        clearActionId="clear:custom"
                        clearIdleLabel="清除已保存 Key"
                        clearBusyLabel="清除中..."
                    />
                </>
            )}
        </SettingsPage>
    );
}
