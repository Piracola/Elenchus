import { motion } from 'framer-motion';
import { BookOpenText, FileUp, X, FileText } from 'lucide-react';
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { toast } from '../../utils/chat/toast';

export type PendingReferenceDocument = {
    file: File;
    id: string;
    name: string;
    size: number;
};

type HomeReferenceLibraryProps = {
    isSophistryMode: boolean;
    pendingDocuments: PendingReferenceDocument[];
    onDocumentsChange: (documents: PendingReferenceDocument[]) => void;
};

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.markdown'];
const ALLOWED_MIME_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown', 'text/md'];

function validateFile(file: File): string | null {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return `不支持的文件格式：${extension}。仅支持 .txt / .md 文件。`;
    }
    
    if (!ALLOWED_MIME_TYPES.includes(file.type) && file.type !== '') {
        return `不支持的 MIME 类型：${file.type}。仅支持文本文件。`;
    }
    
    if (file.size === 0) {
        return '文件为空，请选择包含内容的文件。';
    }
    
    if (file.size > MAX_FILE_SIZE) {
        return `文件大小超过限制（1 MB）。当前文件：${(file.size / 1024).toFixed(2)} KB`;
    }
    
    return null;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
}

export default function HomeReferenceLibrary({
    isSophistryMode,
    pendingDocuments,
    onDocumentsChange,
}: HomeReferenceLibraryProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showPopover, setShowPopover] = useState(false);

    const handleFileSelect = useCallback((files: FileList | null) => {
        if (!files) return;

        const newDocuments: PendingReferenceDocument[] = [];
        const errors: string[] = [];

        Array.from(files).forEach((file) => {
            const error = validateFile(file);
            if (error) {
                errors.push(`${file.name}: ${error}`);
            } else {
                const exists = pendingDocuments.some(
                    (doc) => doc.name === file.name && doc.size === file.size
                );
                if (!exists) {
                    newDocuments.push({
                        file,
                        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        name: file.name,
                        size: file.size,
                    });
                }
            }
        });

        if (errors.length > 0) {
            toast(errors[0], 'error');
        }

        if (newDocuments.length > 0) {
            onDocumentsChange([...pendingDocuments, ...newDocuments]);
            toast(`已添加 ${newDocuments.length} 个参考资料`, 'success');
        }
    }, [pendingDocuments, onDocumentsChange]);

    const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(event.target.files);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    }, [handleFileSelect]);

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        handleFileSelect(event.dataTransfer.files);
    }, [handleFileSelect]);

    const removeDocument = useCallback((id: string) => {
        onDocumentsChange(pendingDocuments.filter((doc) => doc.id !== id));
    }, [pendingDocuments, onDocumentsChange]);

    const handleUploadClick = () => {
        inputRef.current?.click();
    };

    const buttonLabel = pendingDocuments.length > 0
        ? `参考资料 ${pendingDocuments.length}`
        : '参考资料';

    return (
        <div style={{ position: 'relative' }}>
            <input
                ref={inputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                multiple
                onChange={handleInputChange}
                style={{ display: 'none' }}
                data-testid="home-reference-upload-input"
            />

            <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowPopover((current) => !current)}
                data-testid="home-reference-library-button"
                aria-label={buttonLabel}
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
                    position: 'relative',
                }}
                title="上传参考资料（将在创建辩论时一起提交）"
            >
                <BookOpenText size={14} />
                {buttonLabel}
                {pendingDocuments.length > 0 && (
                    <span
                        style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: isSophistryMode
                                ? 'var(--mode-sophistry-accent)'
                                : 'var(--accent-indigo)',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {pendingDocuments.length}
                    </span>
                )}
            </motion.button>

            {showPopover && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 40,
                        }}
                        onClick={() => setShowPopover(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 8px)',
                            right: 0,
                            zIndex: 50,
                            minWidth: '360px',
                            maxWidth: '420px',
                            padding: '16px',
                            background: isSophistryMode
                                ? 'var(--mode-sophistry-card)'
                                : 'var(--bg-card)',
                            border: isSophistryMode
                                ? '1px solid var(--mode-sophistry-border)'
                                : '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xl)',
                            boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '12px',
                            }}
                        >
                            <h3
                                style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                参考资料
                            </h3>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowPopover(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <X size={16} />
                            </motion.button>
                        </div>

                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={{
                                padding: '16px',
                                border: `2px dashed ${
                                    isDragging
                                        ? 'var(--accent-indigo)'
                                        : isSophistryMode
                                        ? 'var(--mode-sophistry-border)'
                                        : 'var(--border-subtle)'
                                }`,
                                borderRadius: 'var(--radius-lg)',
                                background: isDragging
                                    ? 'rgba(99, 102, 241, 0.05)'
                                    : isSophistryMode
                                    ? 'rgba(184, 137, 70, 0.05)'
                                    : 'var(--bg-secondary)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                marginBottom: '12px',
                                transition: 'all var(--transition-fast)',
                            }}
                            onClick={handleUploadClick}
                        >
                            <FileUp
                                size={24}
                                color={isSophistryMode
                                    ? 'var(--mode-sophistry-accent)'
                                    : 'var(--text-muted)'}
                            />
                            <span
                                style={{
                                    fontSize: '13px',
                                    color: 'var(--text-secondary)',
                                    textAlign: 'center',
                                }}
                            >
                                {isDragging ? '松开文件以上传' : '点击或拖拽上传参考资料'}
                            </span>
                            <span
                                style={{
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    textAlign: 'center',
                                }}
                            >
                                支持 .txt / .md，单个文件最大 1 MB
                            </span>
                        </div>

                        {pendingDocuments.length > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    maxHeight: '240px',
                                    overflowY: 'auto',
                                }}
                            >
                                {pendingDocuments.map((doc) => (
                                    <div
                                        key={doc.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            padding: '10px 12px',
                                            background: isSophistryMode
                                                ? 'rgba(184, 137, 70, 0.08)'
                                                : 'var(--bg-secondary)',
                                            border: `1px solid ${
                                                isSophistryMode
                                                    ? 'var(--mode-sophistry-border)'
                                                    : 'var(--border-subtle)'
                                            }`,
                                            borderRadius: 'var(--radius-md)',
                                        }}
                                    >
                                        <FileText
                                            size={16}
                                            color={isSophistryMode
                                                ? 'var(--mode-sophistry-accent)'
                                                : 'var(--text-secondary)'}
                                        />
                                        <div
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '2px',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                    color: 'var(--text-primary)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {doc.name}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '11px',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {formatFileSize(doc.size)}
                                            </span>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => removeDocument(doc.id)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--accent-rose)',
                                                cursor: 'pointer',
                                                padding: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '50%',
                                            }}
                                            title="移除"
                                        >
                                            <X size={14} />
                                        </motion.button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div
                            style={{
                                marginTop: '12px',
                                padding: '10px 12px',
                                background: isSophistryMode
                                    ? 'rgba(184, 137, 70, 0.08)'
                                    : 'rgba(99, 102, 241, 0.05)',
                                border: `1px solid ${
                                    isSophistryMode
                                        ? 'var(--mode-sophistry-border)'
                                        : 'var(--border-subtle)'
                                }`,
                                borderRadius: 'var(--radius-md)',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    lineHeight: 1.5,
                                }}
                            >
                                💡 参考资料将在创建辩论时一起提交，上传后会自动提炼为结构化知识点供辩论使用。
                            </span>
                        </div>
                    </motion.div>
                </>
            )}
        </div>
    );
}
