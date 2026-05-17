import type { CSSProperties } from 'react';

import type { SearchProviderType } from '../../../types';

export const PROVIDER_INFO: Record<SearchProviderType, { label: string; description: string }> = {
    ddgs: {
        label: 'DDGS',
        description: '\u8f7b\u91cf\u7ea7\u805a\u5408\u641c\u7d22\u63d0\u4f9b\u5668\uff0c\u65e0\u9700 Docker \u6216 API Key\uff0c\u53ef\u76f4\u63a5\u968f\u9879\u76ee\u4ea7\u7269\u5206\u53d1\u3002',
    },
    searxng: {
        label: 'SearXNG',
        description: '\u652f\u6301\u63a5\u5165\u4f60\u81ea\u5df1\u7684 SearXNG \u5b9e\u4f8b\uff0c\u53ef\u914d\u7f6e Base URL \u548c API Key\uff0c\u4f46\u4e0d\u518d\u5185\u7f6e Docker \u5b89\u88c5\u7ba1\u7406\u3002',
    },
    tavily: {
        label: 'Tavily',
        description: '\u9762\u5411 AI \u573a\u666f\u7684\u641c\u7d22 API\uff0c\u652f\u6301\u81ea\u5b9a\u4e49 API Key \u548c API URL\u3002',
    },
};

export const inputStyle: CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: '17px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

export const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '16px',
    marginBottom: '10px',
    color: 'var(--text-secondary)',
    fontWeight: 600,
};

export const helperTextStyle: CSSProperties = {
    marginTop: '10px',
    fontSize: '16px',
    color: 'var(--text-muted)',
    lineHeight: 1.8,
};

export function getProviderLabel(provider: SearchProviderType | string): string {
    if (provider in PROVIDER_INFO) {
        return PROVIDER_INFO[provider as SearchProviderType].label;
    }
    return provider || '\u672a\u8bbe\u7f6e';
}
