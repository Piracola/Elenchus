import {
    ArrowRight,
    Check,
    ChevronDown,
    FileText,
    FileUp,
    FlaskConical,
    Scale,
    Settings2,
    SlidersHorizontal,
    X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
    useCallback,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type DragEvent,
} from 'react';
import type { DebateMode } from '../../types';
import { toast } from '../../utils/chat/toast';
import {
    DEFAULT_MAX_TURNS,
    DEFAULT_GROUP_DISCUSSION_ROUNDS,
    DEFAULT_SPEECH_MAX_CHARS,
} from '../../utils/agent/debateSession';
import { HOME_MODE_OPTIONS, type HomeFontSizes } from './shared';

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
    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;

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

function displayValue(value: string, fallback: number): string {
    return value.trim() || String(fallback);
}

type HomeComposerCardProps = {
    topic: string;
    debateMode: DebateMode;
    isCreating: boolean;
    isSophistryMode: boolean;
    showAdvanced: boolean;
    maxTurnsInput: string;
    groupDiscussionRoundsInput: string;
    proposerSpeechLimitInput: string;
    opposerSpeechLimitInput: string;
    groupDiscussionSpeechLimitInput: string;
    homeFontSizes: HomeFontSizes;
    pendingDocuments: PendingReferenceDocument[];
    onDebateModeChange: (mode: DebateMode) => void;
    onDocumentsChange: (documents: PendingReferenceDocument[]) => void;
    onTopicChange: (value: string) => void;
    onShowAdvancedChange: (show: boolean) => void;
    onMaxTurnsChange: (value: string) => void;
    onGroupDiscussionRoundsChange: (value: string) => void;
    onProposerSpeechLimitChange: (value: string) => void;
    onOpposerSpeechLimitChange: (value: string) => void;
    onGroupDiscussionSpeechLimitChange: (value: string) => void;
    onCreateDebate: () => void;
};

const quietButtonStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    minHeight: '36px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid transparent',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)',
    whiteSpace: 'nowrap',
};

const sectionStyle: CSSProperties = {
    minWidth: 0,
    padding: '0',
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
};

const sectionTitleStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: 1.35,
};

const fieldLabelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
};

const numberInputStyle: CSSProperties = {
    width: '100%',
    minWidth: 0,
    height: '34px',
    background: 'var(--bg-card)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600,
    padding: '0 10px',
    MozAppearance: 'textfield',
    WebkitAppearance: 'none',
};

type NumberFieldProps = {
    label: string;
    value: string;
    placeholder: number;
    min: number;
    max: number;
    onChange: (value: string) => void;
};

function NumberField({ label, value, placeholder, min, max, onChange }: NumberFieldProps) {
    return (
        <label style={fieldLabelStyle}>
            <span>{label}</span>
            <input
                type="number"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={String(placeholder)}
                min={min}
                max={max}
                style={numberInputStyle}
                className="home-composer-card__number-input"
            />
        </label>
    );
}

export function HomeComposerCard({
    topic,
    debateMode,
    isCreating,
    isSophistryMode,
    showAdvanced,
    maxTurnsInput,
    groupDiscussionRoundsInput,
    proposerSpeechLimitInput,
    opposerSpeechLimitInput,
    groupDiscussionSpeechLimitInput,
    homeFontSizes,
    pendingDocuments,
    onDebateModeChange,
    onDocumentsChange,
    onTopicChange,
    onShowAdvancedChange,
    onMaxTurnsChange,
    onGroupDiscussionRoundsChange,
    onProposerSpeechLimitChange,
    onOpposerSpeechLimitChange,
    onGroupDiscussionSpeechLimitChange,
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

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
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
    const canCreate = topic.trim().length > 0 && !isCreating;
    const accentColor = isSophistryMode ? 'var(--mode-sophistry-accent)' : 'var(--accent-indigo)';
    const modeIcon = isSophistryMode ? FlaskConical : Scale;
    const ActiveModeIcon = modeIcon;
    const maxTurnsLabel = displayValue(maxTurnsInput, DEFAULT_MAX_TURNS);
    const groupDiscussionRoundsLabel = isSophistryMode
        ? '0'
        : displayValue(groupDiscussionRoundsInput, DEFAULT_GROUP_DISCUSSION_ROUNDS);
    const proposerSpeechLimitLabel = displayValue(proposerSpeechLimitInput, DEFAULT_SPEECH_MAX_CHARS);
    const opposerSpeechLimitLabel = displayValue(opposerSpeechLimitInput, DEFAULT_SPEECH_MAX_CHARS);
    const groupDiscussionSpeechLimitLabel = displayValue(
        groupDiscussionSpeechLimitInput,
        DEFAULT_SPEECH_MAX_CHARS,
    );
    const speechLimitLabel =
        proposerSpeechLimitLabel === '0' && opposerSpeechLimitLabel === '0'
            ? '发言 不限'
            : `发言 正${proposerSpeechLimitLabel} / 反${opposerSpeechLimitLabel}`;
    const discussionLimitLabel = groupDiscussionSpeechLimitLabel === '0'
        ? `赛前讨论 ${groupDiscussionRoundsLabel} 轮`
        : `赛前讨论 ${groupDiscussionRoundsLabel} 轮 / ${groupDiscussionSpeechLimitLabel} 字`;
    const summaryItems = isSophistryMode
        ? [`${maxTurnsLabel} 轮`, speechLimitLabel, '诡辩观察', `资料 ${documentCount}`]
        : [`${maxTurnsLabel} 轮`, discussionLimitLabel, speechLimitLabel, `资料 ${documentCount}`];

    return (
        <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            style={{
                width: '100%',
                background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xs)',
                border: isSophistryMode
                    ? '1px solid var(--mode-sophistry-border)'
                    : '1px solid var(--border-subtle)',
                overflow: 'visible',
            }}
            className="home-composer-card"
        >
            <div
                className="home-composer-card__header"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px 18px 0',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span
                        style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: 'var(--radius-md)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isSophistryMode ? 'var(--mode-sophistry-soft)' : 'var(--accent-indigo-alpha)',
                            color: accentColor,
                            flexShrink: 0,
                        }}
                    >
                        <ActiveModeIcon size={17} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                        <div
                            style={{
                                color: 'var(--text-primary)',
                                fontSize: '15px',
                                fontWeight: 700,
                                lineHeight: 1.35,
                            }}
                        >
                            创建辩论
                        </div>
                        <div
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: '12px',
                                lineHeight: 1.5,
                                marginTop: '2px',
                            }}
                        >
                            {HOME_MODE_OPTIONS.find((item) => item.mode === debateMode)?.description}
                        </div>
                    </div>
                </div>

                <div
                    className="home-composer-card__mode-switch"
                    role="group"
                    aria-label="选择辩论模式"
                    style={{
                        display: 'inline-grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '4px',
                        padding: '4px',
                        borderRadius: 'var(--radius-lg)',
                        background: isSophistryMode ? 'var(--mode-sophistry-soft)' : 'var(--bg-tertiary)',
                        border: '1px solid transparent',
                        minWidth: '240px',
                    }}
                >
                    {HOME_MODE_OPTIONS.map((item) => {
                        const active = debateMode === item.mode;
                        const itemAccent = item.mode === 'sophistry_experiment'
                            ? 'var(--mode-sophistry-accent)'
                            : 'var(--accent-indigo)';

                        return (
                            <motion.button
                                key={item.mode}
                                type="button"
                                onClick={() => onDebateModeChange(item.mode)}
                                aria-pressed={active}
                                className="home-composer-card__mode-button"
                                style={{
                                    minHeight: '32px',
                                    border: '1px solid transparent',
                                    borderRadius: 'var(--radius-md)',
                                    background: active ? 'var(--bg-card)' : 'transparent',
                                    color: active ? itemAccent : 'var(--text-secondary)',
                                    boxShadow: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    transition: 'background var(--transition-fast), color var(--transition-fast)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {active && <Check size={13} />}
                                {item.title}
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            <div className="home-composer-card__input" style={{ padding: '18px 18px 14px' }}>
                <textarea
                    value={topic}
                    onChange={(event) => onTopicChange(event.target.value)}
                    placeholder={isSophistryMode ? '输入辩题，启动一场诡辩实验...' : '输入辩题，开始一场深入辩论...'}
                    rows={5}
                    className="home-composer-card__textarea"
                    style={{
                        width: '100%',
                        background: 'var(--bg-tertiary)',
                        border: isSophistryMode
                            ? '1px solid color-mix(in srgb, var(--mode-sophistry-border) 52%, transparent)'
                            : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        outline: 'none',
                        color: 'var(--text-primary)',
                        fontSize: homeFontSizes.topicInput,
                        resize: 'vertical',
                        lineHeight: 1.65,
                        fontWeight: 500,
                        minHeight: '174px',
                        maxHeight: '300px',
                        padding: '16px',
                        boxShadow: 'var(--shadow-inner)',
                    }}
                />
            </div>

            <div
                className="home-composer-card__footer"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '0 18px 18px',
                }}
            >
                <div
                    className="home-composer-card__summary"
                    style={{
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        flex: 1,
                    }}
                >
                    {summaryItems.map((item) => (
                        <span
                            key={item}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                minHeight: '24px',
                                padding: '0',
                                borderRadius: 'var(--radius-full)',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                fontSize: '12px',
                                fontWeight: 600,
                                lineHeight: 1.3,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {item}
                        </span>
                    ))}
                    <motion.button
                        type="button"
                        onClick={() => onShowAdvancedChange(!showAdvanced)}
                        aria-expanded={showAdvanced}
                        style={{
                            ...quietButtonStyle,
                            borderColor: 'transparent',
                            background: showAdvanced ? 'var(--accent-indigo-alpha)' : 'var(--bg-tertiary)',
                            color: showAdvanced ? accentColor : 'var(--text-secondary)',
                        }}
                        className="home-composer-card__config-toggle"
                    >
                        <Settings2 size={14} />
                        调整配置
                        <motion.span
                            animate={{ rotate: showAdvanced ? 180 : 0 }}
                            transition={{ duration: 0.18 }}
                            style={{ display: 'inline-flex' }}
                        >
                            <ChevronDown size={14} />
                        </motion.span>
                    </motion.button>
                </div>

                <motion.button
                    type="button"
                    onClick={onCreateDebate}
                    disabled={!canCreate}
                    className="home-composer-card__primary"
                    style={{
                        minHeight: '40px',
                        padding: '0 16px 0 18px',
                        borderRadius: 'var(--radius-md)',
                        background: canCreate ? accentColor : 'var(--bg-tertiary)',
                        color: canCreate ? 'white' : 'var(--text-muted)',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: canCreate ? 'pointer' : 'not-allowed',
                        transition: 'background var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast)',
                        boxShadow: 'none',
                        flexShrink: 0,
                        fontSize: '14px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {isCreating ? '创建中' : '开始辩论'}
                    <ArrowRight size={17} />
                </motion.button>
            </div>

            {showAdvanced && (
                <motion.div
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -4 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        overflow: 'visible',
                        padding: '0 18px 18px',
                    }}
                >
                    <div
                        className="home-composer-card__advanced-band"
                        style={{
                            background: isSophistryMode ? 'var(--mode-sophistry-soft)' : 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '18px',
                        }}
                    >
                        <div className="home-composer-card__advanced-header">
                            <span
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: isSophistryMode ? 'var(--mode-sophistry-soft)' : 'var(--accent-indigo-alpha)',
                                    color: accentColor,
                                    flexShrink: 0,
                                }}
                            >
                                <SlidersHorizontal size={15} />
                            </span>
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        color: 'var(--text-primary)',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        lineHeight: 1.35,
                                    }}
                                >
                                    高级配置
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-muted)',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                        marginTop: '2px',
                                    }}
                                >
                                    这些选项会影响辩论流程、发言长度和参考资料。
                                </div>
                            </div>
                        </div>

                        <div className="home-composer-card__advanced-stack">
                            <section style={sectionStyle}>
                                <div style={sectionTitleStyle}>基础流程</div>
                                <div className="home-composer-card__advanced-flow">
                                    <NumberField
                                        label="辩论轮数"
                                        value={maxTurnsInput}
                                        placeholder={DEFAULT_MAX_TURNS}
                                        min={1}
                                        max={100}
                                        onChange={onMaxTurnsChange}
                                    />
                                    {!isSophistryMode && (
                                        <NumberField
                                            label="二轮起赛前讨论"
                                            value={groupDiscussionRoundsInput}
                                            placeholder={DEFAULT_GROUP_DISCUSSION_ROUNDS}
                                            min={0}
                                            max={5}
                                            onChange={onGroupDiscussionRoundsChange}
                                        />
                                    )}
                                </div>
                                {isSophistryMode && (
                                    <div
                                        style={{
                                            padding: '9px 10px',
                                            borderRadius: 'var(--radius-md)',
                                            background: 'var(--mode-sophistry-soft)',
                                            color: 'var(--mode-sophistry-accent)',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        诡辩观察与谬误报告已开启，常规评分与搜索增强关闭。
                                    </div>
                                )}
                            </section>

                            <section style={sectionStyle}>
                                <div style={sectionTitleStyle}>发言字数上限</div>
                                <div className="home-composer-card__speech-limit-grid">
                                    <NumberField
                                        label="正方上限"
                                        value={proposerSpeechLimitInput}
                                        placeholder={DEFAULT_SPEECH_MAX_CHARS}
                                        min={0}
                                        max={20000}
                                        onChange={onProposerSpeechLimitChange}
                                    />
                                    <NumberField
                                        label="反方上限"
                                        value={opposerSpeechLimitInput}
                                        placeholder={DEFAULT_SPEECH_MAX_CHARS}
                                        min={0}
                                        max={20000}
                                        onChange={onOpposerSpeechLimitChange}
                                    />
                                    {!isSophistryMode && (
                                        <NumberField
                                            label="赛前讨论上限"
                                            value={groupDiscussionSpeechLimitInput}
                                            placeholder={DEFAULT_SPEECH_MAX_CHARS}
                                            min={0}
                                            max={20000}
                                            onChange={onGroupDiscussionSpeechLimitChange}
                                        />
                                    )}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-muted)',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    填 0 或留空表示不限；赛前讨论会从第二轮起在正式发言前生成，并通过独立提示词生效。
                                </div>
                            </section>

                            <section style={{ ...sectionStyle, position: 'relative' }}>
                                <div
                                    className="home-composer-card__reference-row"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        minWidth: 0,
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={sectionTitleStyle}>参考资料</div>
                                        <div
                                            style={{
                                                color: 'var(--text-muted)',
                                                fontSize: '12px',
                                                lineHeight: 1.5,
                                                marginTop: '2px',
                                            }}
                                        >
                                            {documentCount > 0
                                                ? `${documentCount} 个文件待上传，创建辩论时提交`
                                                : '未添加资料，支持 .txt / .md'}
                                        </div>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".txt,.md,.markdown,text/plain,text/markdown"
                                        multiple
                                        onChange={handleInputChange}
                                        style={{ display: 'none' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowUploadPopover((current) => !current)}
                                        style={quietButtonStyle}
                                        title="上传参考资料（将在创建辩论时一起提交）"
                                    >
                                        <FileUp size={14} />
                                        管理
                                    </button>

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
                                            className="home-reference-popover"
                                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
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
                                                borderRadius: 'var(--radius-lg)',
                                                boxShadow: 'var(--shadow-lg)',
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
                                                    type="button"
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
                                                    title="关闭"
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
                                                            ? accentColor
                                                            : isSophistryMode
                                                                ? 'var(--mode-sophistry-border)'
                                                                : 'var(--border-subtle)'
                                                    }`,
                                                    borderRadius: 'var(--radius-lg)',
                                                    background: isDragging
                                                        ? (isSophistryMode ? 'var(--mode-sophistry-soft)' : 'var(--accent-indigo-alpha)')
                                                        : 'var(--bg-secondary)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    cursor: 'pointer',
                                                    marginBottom: '12px',
                                                    transition: 'background var(--transition-fast), border-color var(--transition-fast)',
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
                                                                    ? 'var(--mode-sophistry-soft)'
                                                                    : 'var(--bg-secondary)',
                                                                border: '1px solid transparent',
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
                                                                        fontWeight: 600,
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
                                                                type="button"
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
                                                                    borderRadius: 'var(--radius-full)',
                                                                }}
                                                title="移除"
                                                            >
                                                                <X size={14} />
                                                            </motion.button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                        </>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
