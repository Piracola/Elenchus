import { ArrowRight, BookOpenText, ChevronDown, FileUp, FileText, Settings2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { toast } from '../../utils/toast';
import {
    DEFAULT_MAX_TURNS,
    DEFAULT_JURY_AGENTS_PER_JURY,
    DEFAULT_JURY_DISCUSSION_ROUNDS,
    DEFAULT_TEAM_AGENTS_PER_TEAM,
    DEFAULT_TEAM_DISCUSSION_ROUNDS,
} from '../../utils/debateSession';
import type { HomeFontSizes } from './shared';

export type PendingReferenceDocument = {
    file: File;
    id: string;
    name: string;
    size: number;
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

type HomeComposerCardProps = {
    topic: string;
    isCreating: boolean;
    isSophistryMode: boolean;
    showAdvanced: boolean;
    maxTurnsInput: string;
    teamAgentsInput: string;
    teamRoundsInput: string;
    juryAgentsInput: string;
    juryRoundsInput: string;
    steelmanEnabled: boolean;
    homeFontSizes: HomeFontSizes;
    pendingDocuments: PendingReferenceDocument[];
    onDocumentsChange: (documents: PendingReferenceDocument[]) => void;
    onTopicChange: (value: string) => void;
    onShowAdvancedChange: (show: boolean) => void;
    onMaxTurnsChange: (value: string) => void;
    onTeamAgentsChange: (value: string) => void;
    onTeamRoundsChange: (value: string) => void;
    onJuryAgentsChange: (value: string) => void;
    onJuryRoundsChange: (value: string) => void;
    onSteelmanToggle: () => void;
    onCreateDebate: () => void;
};

const controlStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    padding: '8px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: 'var(--shadow-xs)',
} as const;

const numberInputStyle = {
    width: '36px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 500,
    textAlign: 'center',
    MozAppearance: 'textfield',
    WebkitAppearance: 'none',
} as const;

export function HomeComposerCard({
    topic,
    isCreating,
    isSophistryMode,
    showAdvanced,
    maxTurnsInput,
    teamAgentsInput,
    teamRoundsInput,
    juryAgentsInput,
    juryRoundsInput,
    steelmanEnabled,
    homeFontSizes,
    pendingDocuments,
    onDocumentsChange,
    onTopicChange,
    onShowAdvancedChange,
    onMaxTurnsChange,
    onTeamAgentsChange,
    onTeamRoundsChange,
    onJuryAgentsChange,
    onJuryRoundsChange,
    onSteelmanToggle,
    onCreateDebate,
}: HomeComposerCardProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showUploadPopover, setShowUploadPopover] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

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
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
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
        fileInputRef.current?.click();
    };

    const documentCount = pendingDocuments.length;
    const buttonLabel = documentCount > 0 ? `参考资料 ${documentCount}` : '参考资料';

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{
                width: '100%',
                background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-md)',
                border: isSophistryMode
                    ? '1px solid var(--mode-sophistry-border)'
                    : '1px solid var(--border-subtle)',
            }}
        >
            <div style={{ padding: '20px 24px 16px' }}>
                <textarea
                    value={topic}
                    onChange={(event) => onTopicChange(event.target.value)}
                    placeholder={isSophistryMode ? '输入辩题，启动一场诡辩实验...' : '输入辩题，开始一场深入辩论...'}
                    rows={3}
                    style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--text-primary)',
                        fontSize: homeFontSizes.topicInput,
                        resize: 'none',
                        lineHeight: 1.6,
                        fontWeight: 500,
                    }}
                />
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px 16px',
                    borderTop: isSophistryMode
                        ? '1px solid var(--mode-sophistry-border)'
                        : '1px solid var(--border-subtle)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        flex: 1,
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                    }}
                >
                    <motion.button
                        whileHover={{ scale: 1.02, background: 'var(--bg-hover)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onShowAdvancedChange(!showAdvanced)}
                        style={{
                            ...controlStyle,
                            cursor: 'pointer',
                            borderColor: showAdvanced ? 'var(--accent-indigo)' : 'var(--border-subtle)',
                            color: showAdvanced ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                        }}
                    >
                        <Settings2 size={14} />
                        Agent
                        <motion.div
                            animate={{ rotate: showAdvanced ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <ChevronDown size={14} />
                        </motion.div>
                    </motion.button>

                    <div style={controlStyle}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            轮数
                        </span>
                        <input
                            type="number"
                            value={maxTurnsInput}
                            onChange={(event) => onMaxTurnsChange(event.target.value)}
                            placeholder={String(DEFAULT_MAX_TURNS)}
                            min={1}
                            max={100}
                            style={numberInputStyle}
                        />
                    </div>

                    {!isSophistryMode && (
                        <>
                            <div style={controlStyle}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    组内 Agent
                                </span>
                                <input
                                    type="number"
                                    value={teamAgentsInput}
                                    onChange={(event) => onTeamAgentsChange(event.target.value)}
                                    placeholder={String(DEFAULT_TEAM_AGENTS_PER_TEAM)}
                                    min={0}
                                    max={10}
                                    style={numberInputStyle}
                                />
                            </div>

                            <div style={controlStyle}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    组内轮数
                                </span>
                                <input
                                    type="number"
                                    value={teamRoundsInput}
                                    onChange={(event) => onTeamRoundsChange(event.target.value)}
                                    placeholder={String(DEFAULT_TEAM_DISCUSSION_ROUNDS)}
                                    min={0}
                                    max={10}
                                    style={numberInputStyle}
                                />
                            </div>

                            <div style={controlStyle}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    陪审 Agent
                                </span>
                                <input
                                    type="number"
                                    value={juryAgentsInput}
                                    onChange={(event) => onJuryAgentsChange(event.target.value)}
                                    placeholder={String(DEFAULT_JURY_AGENTS_PER_JURY)}
                                    min={0}
                                    max={10}
                                    style={numberInputStyle}
                                />
                            </div>

                            <div style={controlStyle}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    陪审轮数
                                </span>
                                <input
                                    type="number"
                                    value={juryRoundsInput}
                                    onChange={(event) => onJuryRoundsChange(event.target.value)}
                                    placeholder={String(DEFAULT_JURY_DISCUSSION_ROUNDS)}
                                    min={0}
                                    max={10}
                                    style={numberInputStyle}
                                />
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02, background: 'var(--bg-hover)' }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onSteelmanToggle}
                                style={{
                                    ...controlStyle,
                                    cursor: 'pointer',
                                    borderColor: steelmanEnabled ? 'var(--accent-indigo)' : 'var(--border-subtle)',
                                    color: steelmanEnabled ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                }}
                            >
                                Steelman
                                <span style={{ fontSize: '12px', fontWeight: 700 }}>
                                    {steelmanEnabled ? 'ON' : 'OFF'}
                                </span>
                            </motion.button>
                        </>
                    )}

                    {isSophistryMode && (
                        <div
                            style={{
                                ...controlStyle,
                                background: 'rgba(184, 137, 70, 0.08)',
                                borderColor: 'var(--mode-sophistry-border)',
                                color: 'var(--mode-sophistry-accent)',
                            }}
                        >
                            搜索已禁用
                        </div>
                    )}

                    <div style={{ position: 'relative' }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".txt,.md,.markdown,text/plain,text/markdown"
                            multiple
                            onChange={handleInputChange}
                            style={{ display: 'none' }}
                        />

                        <motion.button
                            whileHover={{ scale: 1.02, background: 'var(--bg-hover)' }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowUploadPopover((current) => !current)}
                            style={{
                                ...controlStyle,
                                cursor: 'pointer',
                                position: 'relative',
                            }}
                            title="上传参考资料（将在创建辩论时一起提交）"
                        >
                            <BookOpenText size={14} />
                            {buttonLabel}
                            {documentCount > 0 && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: '-4px',
                                        right: '-4px',
                                        minWidth: '16px',
                                        height: '16px',
                                        borderRadius: '8px',
                                        background: isSophistryMode
                                            ? 'var(--mode-sophistry-accent)'
                                            : 'var(--accent-indigo)',
                                        color: 'white',
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0 3px',
                                    }}
                                >
                                    {documentCount}
                                </span>
                            )}
                        </motion.button>

                        {showUploadPopover && (
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
                                    onClick={() => setShowUploadPopover(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                    style={{
                                        position: 'absolute',
                                        bottom: 'calc(100% + 8px)',
                                        left: 0,
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
                                            onClick={() => setShowUploadPopover(false)}
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
                </div>

                <motion.button
                    whileHover={{ scale: 1.05, boxShadow: 'var(--shadow-md)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onCreateDebate}
                    disabled={!topic.trim() || isCreating}
                    style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: topic.trim() && !isCreating
                            ? (
                                isSophistryMode
                                    ? 'linear-gradient(135deg, var(--mode-sophistry-accent) 0%, #d6a363 100%)'
                                    : 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%)'
                            )
                            : 'var(--bg-tertiary)',
                        color: topic.trim() && !isCreating ? 'white' : 'var(--text-muted)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: topic.trim() && !isCreating ? 'pointer' : 'not-allowed',
                        transition: 'all var(--transition-fast)',
                        boxShadow: topic.trim() && !isCreating
                            ? '0 4px 16px rgba(99, 102, 241, 0.35)'
                            : 'var(--shadow-inner)',
                        flexShrink: 0,
                    }}
                >
                    <ArrowRight size={20} />
                </motion.button>
            </div>
        </motion.div>
    );
}
