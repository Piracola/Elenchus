import { AnimatePresence, motion } from 'framer-motion';

import { SearchProviderSelector } from './search/SearchProviderSelector';
import { SearchProviderSettingsCard } from './search/SearchProviderSettingsCard';
import { getProviderLabel } from './search/searchConfigShared';
import { useSearchConfigState } from './search/useSearchConfigState';

function SearchConfigSkeleton() {
    return (
        <div style={{ display: 'grid', gap: '18px' }}>
            <div
                style={{
                    padding: '22px 24px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-inner)',
                }}
            >
                <motion.div
                    animate={{ opacity: [0.52, 0.88, 0.52] }}
                    transition={{ duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
                    style={{
                        width: '120px',
                        height: '16px',
                        borderRadius: '999px',
                        background: 'var(--bg-hover)',
                        marginBottom: '12px',
                    }}
                />
                <motion.div
                    animate={{ opacity: [0.52, 0.84, 0.52] }}
                    transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay: 0.08 }}
                    style={{
                        width: '54%',
                        height: '18px',
                        borderRadius: '999px',
                        background: 'var(--bg-hover)',
                        marginBottom: '10px',
                    }}
                />
                <motion.div
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 1.22, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay: 0.12 }}
                    style={{
                        width: '88%',
                        height: '14px',
                        borderRadius: '999px',
                        background: 'var(--bg-hover)',
                    }}
                />
            </div>

            {[0, 1].map((index) => (
                <motion.div
                    key={index}
                    animate={{ opacity: [0.54, 0.86, 0.54] }}
                    transition={{
                        duration: 1.1,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: 'easeInOut',
                        delay: index * 0.08,
                    }}
                    style={{
                        padding: '22px 24px',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-card)',
                        boxShadow: 'var(--shadow-xs)',
                        display: 'grid',
                        gap: '14px',
                    }}
                >
                    <div style={{ width: '96px', height: '24px', borderRadius: '999px', background: 'var(--bg-tertiary)' }} />
                    <div style={{ width: '92%', height: '14px', borderRadius: '999px', background: 'var(--bg-tertiary)' }} />
                    <div style={{ width: '100%', height: '46px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)' }} />
                    <div style={{ width: '72%', height: '14px', borderRadius: '999px', background: 'var(--bg-tertiary)' }} />
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
        <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            style={{
                padding: '28px',
                overflowY: 'auto',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xs)',
                position: 'relative',
                height: '100%',
                minHeight: 0,
            }}
        >
            <div
                style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: '22px',
                    marginBottom: '28px',
                }}
            >
                <h3
                    style={{
                        fontSize: '30px',
                        margin: '0 0 14px',
                        color: 'var(--text-primary)',
                        fontWeight: 700,
                    }}
                >
                    {'\u641c\u7d22\u5f15\u64ce\u914d\u7f6e'}
                </h3>
                <p style={{ margin: 0, fontSize: '18px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                    {'\u53ef\u4ee5\u5728\u8fd9\u91cc\u5207\u6362\u5f53\u524d\u641c\u7d22\u5f15\u64ce\uff0cDDGS \u53ef\u5f00\u7bb1\u5373\u7528\uff0cTavily \u5219\u53ef\u4f5c\u4e3a\u53ef\u9009\u7684 API \u641c\u7d22\u8865\u5145\u3002'}
                </p>
            </div>

            <AnimatePresence initial={false}>
                {isRefreshing && !isLoading && (
                    <motion.div
                        key="search-refreshing-banner"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        style={{
                            marginBottom: '16px',
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--accent-indigo-alpha)',
                            color: 'var(--text-secondary)',
                            fontSize: '14px',
                        }}
                    >
                        {'\u6b63\u5728\u540c\u6b65\u6700\u65b0\u641c\u7d22\u914d\u7f6e...'}
                    </motion.div>
                )}
            </AnimatePresence>

            {error && !isLoading && (
                <div
                    style={{
                        padding: '14px 18px',
                        background: 'var(--color-red-50)',
                        border: '1px solid var(--color-red-200)',
                        borderRadius: 'var(--radius-lg)',
                        marginBottom: '16px',
                        color: 'var(--color-red-700)',
                        fontSize: '17px',
                    }}
                >
                    {error}
                </div>
            )}

            {isLoading ? (
                <SearchConfigSkeleton />
            ) : (
                <>
                    <SearchProviderSelector
                        providers={providers}
                        currentProvider={currentProvider}
                        activeAction={activeAction}
                        isBusy={isBusy}
                        onProviderChange={(providerName) => {
                            void handleProviderChange(providerName);
                        }}
                    />

                    <div
                        style={{
                            marginTop: '28px',
                            display: 'grid',
                            gap: '18px',
                            paddingBottom: '20px',
                        }}
                    >
                        <div
                            style={{
                                padding: '22px 24px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: 'var(--shadow-inner)',
                            }}
                        >
                            <div style={{ fontSize: '17px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                                {'\u5f53\u524d\u72b6\u6001'}
                            </div>
                            <div style={{ fontSize: '17px', color: 'var(--text-muted)' }}>
                                {'\u5f53\u524d\u4f7f\u7528\uff1a'}
                                <strong style={{ color: 'var(--text-primary)' }}> {getProviderLabel(currentProvider)}</strong>
                            </div>
                            <div style={{ fontSize: '16px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.7 }}>
                                {'\u63d0\u793a\uff1a\u5982\u679c\u5f53\u524d\u5f15\u64ce\u4e0d\u53ef\u7528\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u5c1d\u8bd5\u56de\u9000\u5230\u5176\u4ed6\u53ef\u7528\u641c\u7d22\u5f15\u64ce\u3002'}
                            </div>
                        </div>

                        <SearchProviderSettingsCard
                            title="SearXNG"
                            description={'\u53ef\u4ee5\u8bbe\u7f6e\u5176\u4ed6 SearXNG \u5b9e\u4f8b\u7684 Base URL \u548c API Key\uff0c\u4f5c\u4e3a\u9879\u76ee\u5916\u90e8\u641c\u7d22\u670d\u52a1\u63a5\u5165\uff0c\u4f46\u4e0d\u518d\u5185\u7f6e Docker \u5b89\u88c5\u6216\u542f\u505c\u7ba1\u7406\u3002'}
                            fields={[
                                {
                                    label: 'Base URL',
                                    value: searxngBaseUrl,
                                    onChange: (event) => setSearxngBaseUrl(event.target.value),
                                    placeholder: 'http://localhost:8080',
                                    helperText: '\u7559\u7a7a\u540e\u4fdd\u5b58\u4f1a\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u5730\u5740 http://localhost:8080\u3002',
                                },
                                {
                                    label: 'API Key',
                                    type: 'password',
                                    autoComplete: 'off',
                                    value: searxngApiKey,
                                    onChange: (event) => setSearxngApiKey(event.target.value),
                                    placeholder: searxngApiKeyConfigured ? '\u7559\u7a7a\u5219\u4fdd\u6301\u5df2\u4fdd\u5b58\u7684 Key' : '\u53ef\u9009',
                                    helperText: searxngApiKeyConfigured
                                        ? '\u5df2\u4fdd\u5b58 SearXNG API Key\uff0c\u5982\u65e0\u9700\u66ff\u6362\u53ef\u4fdd\u6301\u4e3a\u7a7a\u3002'
                                        : '\u5982\u679c\u4f60\u7684 SearXNG \u5b9e\u4f8b\u5728\u7f51\u5173\u3001\u53cd\u5411\u4ee3\u7406\u6216\u9274\u6743\u5c42\u540e\u9762\uff0c\u53ef\u4ee5\u5728\u8fd9\u91cc\u586b\u5199 API Key\u3002',
                                },
                            ]}
                            onSave={() => {
                                void handleSaveSearxng();
                            }}
                            isBusy={isBusy}
                            activeAction={activeAction}
                            saveActionId="save:searxng"
                            saveIdleLabel={'\u4fdd\u5b58 SearXNG'}
                            saveBusyLabel={'\u4fdd\u5b58\u4e2d...'}
                            showClearButton={searxngApiKeyConfigured}
                            onClear={() => {
                                void handleClearKey('searxng');
                            }}
                            clearActionId="clear:searxng"
                            clearIdleLabel={'\u6e05\u9664\u5df2\u4fdd\u5b58 Key'}
                            clearBusyLabel={'\u6e05\u9664\u4e2d...'}
                        />

                        <SearchProviderSettingsCard
                            title="DDGS"
                            description={'\u8fd9\u662f\u9879\u76ee\u5185\u7f6e\u7684\u8f7b\u91cf\u641c\u7d22\u63d0\u4f9b\u5668\uff0c\u76f4\u63a5\u968f\u540e\u7aef\u5206\u53d1\uff0c\u65e0\u9700 Docker\uff0c\u65e0\u9700\u5355\u72ec\u670d\u52a1\uff0c\u4e5f\u4e0d\u9700\u914d\u7f6e API Key\u3002'}
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
                            description={'\u53ef\u4ee5\u914d\u7f6e Tavily API Key\uff0c\u4e5f\u53ef\u4ee5\u5728\u6709\u4ee3\u7406\u6216\u81ea\u5efa\u8f6c\u53d1\u7aef\u7684\u573a\u666f\u4e0b\u66ff\u6362 API URL\u3002'}
                            fields={[
                                {
                                    label: 'API URL',
                                    value: tavilyApiUrl,
                                    onChange: (event) => setTavilyApiUrl(event.target.value),
                                    placeholder: 'https://api.tavily.com/search',
                                    helperText: '\u7559\u7a7a\u540e\u4fdd\u5b58\u4f1a\u91cd\u7f6e\u4e3a\u9ed8\u8ba4 Tavily \u63a5\u53e3\u5730\u5740\u3002',
                                },
                                {
                                    label: 'API Key',
                                    type: 'password',
                                    autoComplete: 'off',
                                    value: tavilyApiKey,
                                    onChange: (event) => setTavilyApiKey(event.target.value),
                                    placeholder: tavilyApiKeyConfigured ? '\u7559\u7a7a\u5219\u4fdd\u6301\u5df2\u4fdd\u5b58\u7684 Key' : 'tvly-...',
                                    helperText: tavilyApiKeyConfigured
                                        ? '\u5df2\u4fdd\u5b58 Tavily API Key\u3002\u5982\u679c\u4e0d\u9700\u8981\u66ff\u6362\uff0c\u53ef\u4ee5\u4fdd\u6301\u4e3a\u7a7a\u3002'
                                        : '\u914d\u7f6e Tavily API Key \u540e\uff0cTavily \u63d0\u4f9b\u5668\u624d\u4f1a\u88ab\u6807\u8bb0\u4e3a\u53ef\u7528\u3002',
                                },
                            ]}
                            onSave={() => {
                                void handleSaveTavily();
                            }}
                            isBusy={isBusy}
                            activeAction={activeAction}
                            saveActionId="save:tavily"
                            saveIdleLabel={'\u4fdd\u5b58 Tavily'}
                            saveBusyLabel={'\u4fdd\u5b58\u4e2d...'}
                            showClearButton={tavilyApiKeyConfigured}
                            onClear={() => {
                                void handleClearKey('tavily');
                            }}
                            clearActionId="clear:tavily"
                            clearIdleLabel={'\u6e05\u9664\u5df2\u4fdd\u5b58 Key'}
                            clearBusyLabel={'\u6e05\u9664\u4e2d...'}
                        />
                    </div>
                </>
            )}
        </motion.div>
    );
}
