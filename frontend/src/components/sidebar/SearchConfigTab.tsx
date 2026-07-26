import { AnimatePresence, motion } from 'framer-motion';
import { ListOrdered, RefreshCw, Save, Search } from 'lucide-react';

import { SearchProviderSelector } from './search/SearchProviderSelector';
import { SearchProviderSettingsCard } from './search/SearchProviderSettingsCard';
import { useSearchConfigState } from './search/useSearchConfigState';
import {
    SettingsBadge,
    SettingsButton,
    SettingsField,
    SettingsInput,
    SettingsNotice,
    SettingsPage,
    SettingsSection,
} from './settings/SettingsPrimitives';

const MIN_RESULTS_PER_QUERY = 1;
const MAX_RESULTS_PER_QUERY = 10;

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
    } = useSearchConfigState();

    const activeLabel =
        providers.find((provider) => provider.name === currentProvider)?.label ?? currentProvider;
    const fallbackLabel = providers.at(-1)?.label ?? 'DDGS';

    return (
        <SettingsPage
            title="搜索引擎配置"
            description="选择检索 provider 并填写其密钥。所有 provider 由后端注册表声明，字段随之自动呈现。"
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

            {error && !isLoading && <SettingsNotice tone="error">{error}</SettingsNotice>}

            {isLoading ? (
                <SearchConfigSkeleton />
            ) : (
                <>
                    <SettingsSection
                        title="当前引擎"
                        description="未填写必填项的 provider 会保持禁用。"
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
                                <SettingsBadge tone="accent">{activeLabel}</SettingsBadge>
                            </div>
                            <div className="settings-field-hint" style={{ marginTop: 0 }}>
                                当前引擎不可用时，系统会按注册顺序回退，最终兜底到 {fallbackLabel}。
                            </div>
                        </div>
                    </SettingsSection>

                    <SettingsSection
                        title="检索用量"
                        description="每个子查询返回的结果条数，直接影响注入提示词的证据量。"
                        icon={<ListOrdered size={15} />}
                    >
                        <div className="settings-form-grid">
                            <SettingsField
                                label="单次检索结果数"
                                hint={`取值 ${MIN_RESULTS_PER_QUERY}-${MAX_RESULTS_PER_QUERY}，越大证据越多，也越占上下文。`}
                            >
                                <SettingsInput
                                    type="number"
                                    min={MIN_RESULTS_PER_QUERY}
                                    max={MAX_RESULTS_PER_QUERY}
                                    value={String(maxResultsPerQuery)}
                                    onChange={(event) => {
                                        const parsed = Number.parseInt(event.target.value, 10);
                                        if (Number.isNaN(parsed)) return;
                                        setMaxResultsPerQuery(
                                            Math.max(
                                                MIN_RESULTS_PER_QUERY,
                                                Math.min(MAX_RESULTS_PER_QUERY, parsed),
                                            ),
                                        );
                                    }}
                                />
                            </SettingsField>
                        </div>
                        <div className="settings-inline-controls">
                            <SettingsButton
                                variant="primary"
                                onClick={() => {
                                    void handleSaveMaxResults(maxResultsPerQuery);
                                }}
                                disabled={isBusy}
                                icon={<Save size={15} />}
                            >
                                {activeAction === 'save:max-results' ? '保存中...' : '保存结果数'}
                            </SettingsButton>
                        </div>
                    </SettingsSection>

                    {providers.map((provider) => (
                        <SearchProviderSettingsCard
                            key={provider.name}
                            provider={provider}
                            draft={drafts[provider.name] ?? {}}
                            onFieldChange={(fieldKey, value) => {
                                setFieldValue(provider.name, fieldKey, value);
                            }}
                            onSave={() => {
                                void handleSaveProvider(provider.name);
                            }}
                            onClearSecret={(fieldKey) => {
                                void handleClearSecret(provider.name, fieldKey);
                            }}
                            isBusy={isBusy}
                            activeAction={activeAction}
                        />
                    ))}
                </>
            )}
        </SettingsPage>
    );
}
