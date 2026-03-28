import type { CSSProperties } from 'react';

import type { SearchProviderType } from '../../../types';

export const PROVIDER_INFO: Record<SearchProviderType, { label: string; description: string }> = {
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
