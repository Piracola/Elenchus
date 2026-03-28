import { SearchProviderSelector } from './search/SearchProviderSelector';
import { SearchProviderSettingsCard } from './search/SearchProviderSettingsCard';
import { getProviderLabel } from './search/searchConfigShared';
import { useSearchConfigState } from './search/useSearchConfigState';

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
        isBusy,
        activeAction,
        error,
        handleProviderChange,
        handleSaveSearxng,
        handleSaveTavily,
        handleClearKey,
    } = useSearchConfigState();

    if (isLoading) {
        return (
            <div
                style={{
                    padding: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                }}
            >
                <div style={{ fontSize: '18px', color: 'var(--text-muted)' }}>
                    {'\u6b63\u5728\u52a0\u8f7d\u641c\u7d22\u914d\u7f6e...'}
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                padding: '40px',
                overflowY: 'auto',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xs)',
            }}
        >
            <div
                style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: '30px',
                    marginBottom: '36px',
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
                    {'\u53ef\u4ee5\u5728\u8fd9\u91cc\u5207\u6362\u5f53\u524d\u641c\u7d22\u5f15\u64ce\uff0c\u5e76\u7ef4\u62a4 SearXNG / Tavily \u7684\u8fd0\u884c\u65f6\u53c2\u6570\u3002'}
                </p>
            </div>

            {error && (
                <div
                    style={{
                        padding: '18px 22px',
                        background: 'var(--color-red-50)',
                        border: '1px solid var(--color-red-200)',
                        borderRadius: 'var(--radius-lg)',
                        marginBottom: '20px',
                        color: 'var(--color-red-700)',
                        fontSize: '17px',
                    }}
                >
                    {error}
                </div>
            )}

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
                    marginTop: '36px',
                    display: 'grid',
                    gap: '24px',
                }}
            >
                <div
                    style={{
                        padding: '28px 30px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-inner)',
                    }}
                >
                    <div style={{ fontSize: '17px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '12px' }}>
                        {'\u5f53\u524d\u72b6\u6001'}
                    </div>
                    <div style={{ fontSize: '17px', color: 'var(--text-muted)' }}>
                        {'\u5f53\u524d\u4f7f\u7528\uff1a'}
                        <strong style={{ color: 'var(--text-primary)' }}> {getProviderLabel(currentProvider)}</strong>
                    </div>
                    <div style={{ fontSize: '16px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.8 }}>
                        {'\u63d0\u793a\uff1a\u5982\u679c\u5f53\u524d\u5f15\u64ce\u4e0d\u53ef\u7528\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u5c1d\u8bd5\u56de\u9000\u5230\u5176\u4ed6\u53ef\u7528\u641c\u7d22\u5f15\u64ce\u3002'}
                    </div>
                </div>

                <SearchProviderSettingsCard
                    title="SearXNG"
                    description={'\u53ef\u4ee5\u8bbe\u7f6e\u81ea\u5efa SearXNG \u5b9e\u4f8b\u5730\u5740\uff0c\u5e76\u4e3a\u53d7\u4fdd\u62a4\u7684\u7f51\u5173\u4fdd\u5b58 API Key\u3002'}
                    fields={[
                        {
                            label: 'Base URL',
                            value: searxngBaseUrl,
                            onChange: (event) => setSearxngBaseUrl(event.target.value),
                            placeholder: 'http://localhost:8080',
                            helperText: '\u7559\u7a7a\u540e\u4fdd\u5b58\u4f1a\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u503c http://localhost:8080\u3002',
                        },
                        {
                            label: 'API Key',
                            type: 'password',
                            autoComplete: 'off',
                            value: searxngApiKey,
                            onChange: (event) => setSearxngApiKey(event.target.value),
                            placeholder: searxngApiKeyConfigured ? '\u7559\u7a7a\u5219\u4fdd\u6301\u5df2\u4fdd\u5b58\u7684 Key' : '\u53ef\u9009',
                            helperText: searxngApiKeyConfigured
                                ? '\u5df2\u4fdd\u5b58 SearXNG API Key\u3002\u5982\u679c\u4e0d\u9700\u8981\u66ff\u6362\uff0c\u53ef\u4ee5\u76f4\u63a5\u4fdd\u6301\u4e3a\u7a7a\u3002'
                                : '\u5982\u679c\u4f60\u7684 SearXNG \u90e8\u7f72\u5728\u4ee3\u7406\u6216\u7f51\u5173\u540e\u9762\uff0c\u53ef\u4ee5\u5728\u8fd9\u91cc\u586b\u5199 API Key\u3002',
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
        </div>
    );
}
