import type { DocumentStatus, ReferenceLibraryResponse } from '../../../types';

export const EMPTY_LIBRARY: ReferenceLibraryResponse = {
    documents: [],
    entries: [],
};

export type ReferenceLibraryPanelProps = {
    currentSessionId: string;
    isSophistryMode: boolean;
};

export function formatSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }
    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getStatusMeta(status: DocumentStatus): {
    label: string;
    background: string;
    color: string;
} {
    switch (status) {
        case 'processed':
            return {
                label: '已处理',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--accent-emerald)',
            };
        case 'processing':
            return {
                label: '处理中',
                background: 'rgba(245, 158, 11, 0.14)',
                color: 'var(--accent-amber)',
            };
        case 'failed':
            return {
                label: '处理失败',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--accent-rose)',
            };
        case 'uploaded':
        default:
            return {
                label: '已上传',
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--accent-indigo)',
            };
    }
}

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '参考资料操作失败';
}

export function countEntriesByDocumentId(referenceLibrary: ReferenceLibraryResponse): Record<string, number> {
    const entryCountByDocumentId: Record<string, number> = {};
    for (const entry of referenceLibrary.entries) {
        entryCountByDocumentId[entry.document_id] = (entryCountByDocumentId[entry.document_id] ?? 0) + 1;
    }
    return entryCountByDocumentId;
}
