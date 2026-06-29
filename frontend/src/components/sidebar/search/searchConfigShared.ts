import type { CSSProperties } from 'react';

import type { SearchProviderType } from '../../../types';

export const PROVIDER_INFO: Record<SearchProviderType, { label: string; description: string }> = {
    ddgs: {
        label: 'DDGS',
        description: '\u8f7b\u91cf\u7ea7\u805a\u5408\u641c\u7d22\u63d0\u4f9b\u5668\uff0c\u65e0\u9700 Docker \u6216 API Key\uff0c\u53ef\u76f4\u63a5\u968f\u9879\u76ee\u4ea7\u7269\u5206\u53d1\u3002',
    },
    custom: {
        label: '自定义',
        description: '接入你自己的 HTTP 搜索桥接接口，避免项目内置维护多套第三方搜索协议。',
    },
};

export const inputStyle: CSSProperties = {
    width: '100%',
    minHeight: '40px',
    padding: '9px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

export const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '13px',
    marginBottom: '8px',
    color: 'var(--text-secondary)',
    fontWeight: 700,
};

export const helperTextStyle: CSSProperties = {
    marginTop: '8px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: 1.55,
};

export function getProviderLabel(provider: SearchProviderType | string): string {
    if (provider in PROVIDER_INFO) {
        return PROVIDER_INFO[provider as SearchProviderType].label;
    }
    return provider || '\u672a\u8bbe\u7f6e';
}
