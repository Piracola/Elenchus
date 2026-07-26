import { AnimatePresence, motion } from 'framer-motion';
import { FileUp, RefreshCw, Trash2 } from 'lucide-react';
import type { SessionDocumentsResponse } from '../../../types';
import { formatSize, getStatusMeta } from './shared';
import {
    HEADER_TOOLBAR_PANEL_STYLE,
    HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
    HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
} from '../toolbarStyles';
import { POPOVER_MOTION, PRESSABLE, PRESSABLE_ICON } from '../../../config/motion';

type ReferenceLibraryPopoverProps = {
    currentSessionId: string;
    deletingDocumentId: string | null;
    errorMessage: string;
    hasLoaded: boolean;
    isLoading: boolean;
    isOpen: boolean;
    isSophistryMode: boolean;
    isUploading: boolean;
    onDeleteDocument: (documentId: string, filename: string) => void;
    onRefresh: (sessionId: string) => void;
    onUploadClick: () => void;
    referenceLibrary: SessionDocumentsResponse;
};

export function ReferenceLibraryPopover({
    currentSessionId,
    deletingDocumentId,
    errorMessage,
    hasLoaded,
    isLoading,
    isOpen,
    isSophistryMode,
    isUploading,
    onDeleteDocument,
    onRefresh,
    onUploadClick,
    referenceLibrary,
}: ReferenceLibraryPopoverProps) {
    return (
        <AnimatePresence>
            {isOpen && (
        <motion.div
            key="reference-library-popover"
            {...POPOVER_MOTION}
            style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                width: 'min(360px, calc(100vw - 64px))',
                padding: '14px',
                background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                border: isSophistryMode
                    ? '1px solid var(--mode-sophistry-border)'
                    : '1px solid var(--border-subtle)',
                boxShadow: HEADER_TOOLBAR_PANEL_STYLE.boxShadow,
                borderRadius: HEADER_TOOLBAR_PANEL_STYLE.borderRadius,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                zIndex: 100,
                transformOrigin: 'top left',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    参考资料
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    支持 .txt / .md，单个文件最大 1 MB。上传后会作为当前辩论的公共背景。
                </span>
                {hasLoaded && (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        已上传 {referenceLibrary.documents.length} 份参考资料
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <motion.button
                    {...PRESSABLE}
                    onClick={onUploadClick}
                    disabled={isUploading || Boolean(deletingDocumentId)}
                    style={{
                        ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                        padding: '9px 12px',
                        opacity: isUploading || deletingDocumentId ? 0.65 : 1,
                        flex: 1,
                    }}
                >
                    <FileUp size={14} />
                    {isUploading ? '上传中...' : '上传参考资料'}
                </motion.button>

                <motion.button
                    {...PRESSABLE_ICON}
                    onClick={() => onRefresh(currentSessionId)}
                    disabled={isLoading || isUploading}
                    style={{
                        ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                        width: '36px',
                        height: '36px',
                        opacity: isLoading || isUploading ? 0.65 : 1,
                        flexShrink: 0,
                        padding: 0,
                    }}
                    title="刷新参考资料列表"
                >
                    <RefreshCw
                        size={14}
                        style={{
                            transform: isLoading ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform var(--transition-normal)',
                        }}
                    />
                </motion.button>
            </div>

            {errorMessage && (
                <div
                    style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: 'var(--accent-rose)',
                        fontSize: '12px',
                        lineHeight: 1.5,
                    }}
                >
                    {errorMessage}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {!hasLoaded && isLoading && (
                    <div
                        style={{
                            padding: '14px',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                        }}
                    >
                        正在加载参考资料...
                    </div>
                )}

                {hasLoaded && referenceLibrary.documents.length === 0 && !isLoading && (
                    <div
                        style={{
                            padding: '14px',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                            lineHeight: 1.6,
                        }}
                    >
                        还没有上传参考资料。可以先上传一份背景说明、术语表或论据草稿。
                    </div>
                )}

                {referenceLibrary.documents.map((document) => {
                    const statusMeta = getStatusMeta(document.status);
                    const isDeleting = deletingDocumentId === document.id;

                    return (
                        <div
                            key={document.id}
                            style={{
                                padding: '12px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                }}
                            >
                                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <span
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                        title={document.filename}
                                    >
                                        {document.filename}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: '3px 8px',
                                                borderRadius: 'var(--radius-full)',
                                                background: statusMeta.background,
                                                color: statusMeta.color,
                                                fontSize: '11px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {statusMeta.label}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {formatSize(document.size_bytes)}
                                        </span>
                                    </div>
                                </div>

                                <motion.button
                                    {...PRESSABLE_ICON}
                                    onClick={() => onDeleteDocument(document.id, document.filename)}
                                    disabled={isDeleting || isUploading}
                                    style={{
                                        ...HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE,
                                        width: '32px',
                                        height: '32px',
                                        opacity: isDeleting || isUploading ? 0.55 : 1,
                                        flexShrink: 0,
                                        padding: 0,
                                        background: 'transparent',
                                    }}
                                    title={isDeleting ? '删除中...' : '删除参考资料'}
                                >
                                    <Trash2 size={14} />
                                </motion.button>
                            </div>

                            {document.summary_short && (
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {document.summary_short}
                                </div>
                            )}

                            {document.error_message && (
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'var(--accent-rose)',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {document.error_message}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </motion.div>
            )}
        </AnimatePresence>
    );
}
