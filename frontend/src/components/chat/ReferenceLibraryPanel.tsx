import {
    startTransition,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    type ChangeEvent,
} from 'react';
import { motion } from 'framer-motion';
import { BookOpenText, FileUp, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { useSessionActions } from '../../hooks/useDebateViewState';
import type { DocumentStatus, ReferenceLibraryResponse } from '../../types';
import { toast } from '../../utils/toast';

type ReferenceLibraryPanelProps = {
    currentSessionId: string;
    isSophistryMode: boolean;
};

const EMPTY_LIBRARY: ReferenceLibraryResponse = {
    documents: [],
    entries: [],
};

function formatSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }
    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusMeta(status: DocumentStatus): {
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

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '参考资料操作失败';
}

export default function ReferenceLibraryPanel({
    currentSessionId,
    isSophistryMode,
}: ReferenceLibraryPanelProps) {
    const { setCurrentSession } = useSessionActions();
    const inputRef = useRef<HTMLInputElement>(null);
    const requestIdRef = useRef(0);
    const [isOpen, setIsOpen] = useState(false);
    const [referenceLibrary, setReferenceLibrary] = useState<ReferenceLibraryResponse>(EMPTY_LIBRARY);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    const loadReferenceLibrary = useEffectEvent(async (sessionId: string) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setIsLoading(true);
        setErrorMessage('');

        try {
            const data = await api.sessions.getReferenceLibrary(sessionId);
            if (requestIdRef.current !== requestId) {
                return;
            }
            startTransition(() => {
                setReferenceLibrary(data);
            });
            setHasLoaded(true);
        } catch (error) {
            if (requestIdRef.current !== requestId) {
                return;
            }
            setErrorMessage(getErrorMessage(error));
        } finally {
            if (requestIdRef.current === requestId) {
                setIsLoading(false);
            }
        }
    });

    const refreshSession = useEffectEvent(async (sessionId: string) => {
        const latestSession = await api.sessions.get(sessionId);
        startTransition(() => {
            setCurrentSession(latestSession);
        });
    });

    useEffect(() => {
        requestIdRef.current += 1;
        setIsOpen(false);
        setReferenceLibrary(EMPTY_LIBRARY);
        setHasLoaded(false);
        setIsLoading(false);
        setIsUploading(false);
        setDeletingDocumentId(null);
        setErrorMessage('');
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    }, [currentSessionId]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        void loadReferenceLibrary(currentSessionId);
    }, [currentSessionId, isOpen]);

    const handleUploadButtonClick = () => {
        if (isUploading || deletingDocumentId) {
            return;
        }
        inputRef.current?.click();
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setIsUploading(true);
        setErrorMessage('');
        try {
            await api.sessions.uploadDocument(currentSessionId, file);
            await Promise.all([
                loadReferenceLibrary(currentSessionId),
                refreshSession(currentSessionId),
            ]);
            toast(`参考资料已上传：${file.name}`, 'success');
            setIsOpen(true);
        } catch (error) {
            const message = getErrorMessage(error);
            setErrorMessage(message);
            toast(message, 'error');
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };

    const handleDeleteDocument = async (documentId: string, filename: string) => {
        setDeletingDocumentId(documentId);
        setErrorMessage('');
        try {
            await api.sessions.deleteDocument(currentSessionId, documentId);
            await Promise.all([
                loadReferenceLibrary(currentSessionId),
                refreshSession(currentSessionId),
            ]);
            toast(`参考资料已删除：${filename}`, 'success');
        } catch (error) {
            const message = getErrorMessage(error);
            setErrorMessage(message);
            toast(message, 'error');
        } finally {
            setDeletingDocumentId(null);
        }
    };

    const entryCountByDocumentId: Record<string, number> = {};
    for (const entry of referenceLibrary.entries) {
        entryCountByDocumentId[entry.document_id] = (entryCountByDocumentId[entry.document_id] ?? 0) + 1;
    }

    const buttonLabel = hasLoaded
        ? `参考资料 ${referenceLibrary.documents.length}`
        : '参考资料';

    return (
        <div style={{ position: 'relative' }}>
            <input
                ref={inputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                data-testid="reference-upload-input"
            />

            <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen((current) => !current)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    background: isSophistryMode
                        ? 'rgba(184, 137, 70, 0.14)'
                        : 'var(--bg-tertiary)',
                    color: isSophistryMode
                        ? 'var(--mode-sophistry-accent)'
                        : 'var(--text-secondary)',
                    border: isSophistryMode
                        ? '1px solid var(--mode-sophistry-border)'
                        : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                }}
                title="查看并上传参考资料"
            >
                <BookOpenText size={14} />
                {buttonLabel}
            </motion.button>

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: 'min(360px, calc(100vw - 64px))',
                        padding: '14px',
                        borderRadius: 'var(--radius-xl)',
                        background: isSophistryMode
                            ? 'var(--mode-sophistry-card)'
                            : 'var(--bg-card)',
                        border: isSophistryMode
                            ? '1px solid var(--mode-sophistry-border)'
                            : '1px solid var(--border-subtle)',
                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            参考资料
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            支持 .txt / .md，单个文件最大 1 MB。上传后会同步到后端参考库。
                        </span>
                        {hasLoaded && (
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                已上传 {referenceLibrary.documents.length} 份，提炼出 {referenceLibrary.entries.length} 条参考要点
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <motion.button
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleUploadButtonClick}
                            disabled={isUploading || Boolean(deletingDocumentId)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '9px 12px',
                                background: 'var(--text-primary)',
                                color: 'var(--bg-primary)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: isUploading || deletingDocumentId ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                opacity: isUploading || deletingDocumentId ? 0.65 : 1,
                                flex: 1,
                            }}
                        >
                            <FileUp size={14} />
                            {isUploading ? '上传中...' : '上传参考资料'}
                        </motion.button>

                        <motion.button
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                                void loadReferenceLibrary(currentSessionId);
                            }}
                            disabled={isLoading || isUploading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '36px',
                                height: '36px',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                cursor: isLoading || isUploading ? 'not-allowed' : 'pointer',
                                opacity: isLoading || isUploading ? 0.65 : 1,
                                flexShrink: 0,
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
                            const entryCount = entryCountByDocumentId[document.id] ?? 0;
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
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {entryCount} 条要点
                                                </span>
                                            </div>
                                        </div>

                                        <motion.button
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                void handleDeleteDocument(document.id, document.filename);
                                            }}
                                            disabled={isDeleting || isUploading}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '32px',
                                                height: '32px',
                                                background: 'transparent',
                                                color: 'var(--text-muted)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: isDeleting || isUploading ? 'not-allowed' : 'pointer',
                                                opacity: isDeleting || isUploading ? 0.55 : 1,
                                                flexShrink: 0,
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
                </div>
            )}
        </div>
    );
}
