import { useEffect, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, FileJson, FileText } from 'lucide-react';
import { api } from '../../api/client';
import type { MarkdownExportCategory } from '../../types';
import { toast } from '../../utils/toast';
import StatusBanner from './StatusBanner';
import ReferenceLibraryPanel from './ReferenceLibraryPanel';
import SidebarExpandButton from '../shared/SidebarExpandButton';
import SophistryModeNotice from '../shared/SophistryModeNotice';

const MARKDOWN_EXPORT_OPTIONS: { value: MarkdownExportCategory; label: string }[] = [
    { value: 'group_discussion', label: '组内讨论' },
    { value: 'judge_messages', label: '裁判消息' },
    { value: 'jury_messages', label: '审判团消息' },
    { value: 'consensus_summary', label: '共识收敛消息' },
];

type TranscriptCollapseSummary = {
    keys: string[];
    hasAgentRows: boolean;
    allCollapsed: boolean;
};

type ChatHeaderOverlayProps = {
    overlayRef: RefObject<HTMLDivElement | null>;
    isSidebarCollapsed: boolean;
    onExpandSidebar: () => void;
    hasCurrentSession: boolean;
    currentSessionId: string | null;
    currentTopic: string;
    currentTurn: number;
    maxTurns: number;
    isSophistryMode: boolean;
    modeArtifactsLength: number;
    topicTitleFontSize: string;
    transcriptCollapseSummary: TranscriptCollapseSummary;
    bulkCollapseLabel: string;
    onToggleAllAgentMessages: () => void;
};

export default function ChatHeaderOverlay({
    overlayRef,
    isSidebarCollapsed,
    onExpandSidebar,
    hasCurrentSession,
    currentSessionId,
    currentTopic,
    currentTurn,
    maxTurns,
    isSophistryMode,
    modeArtifactsLength,
    topicTitleFontSize,
    transcriptCollapseSummary,
    bulkCollapseLabel,
    onToggleAllAgentMessages,
}: ChatHeaderOverlayProps) {
    const [exportingFormat, setExportingFormat] = useState<'markdown' | 'json' | null>(null);
    const [showMarkdownExportOptions, setShowMarkdownExportOptions] = useState(false);
    const [markdownExportCategories, setMarkdownExportCategories] = useState<MarkdownExportCategory[]>([]);

    useEffect(() => {
        setShowMarkdownExportOptions(false);
    }, [currentSessionId]);

    const toggleMarkdownExportCategory = (category: MarkdownExportCategory) => {
        setMarkdownExportCategories((current) => (
            current.includes(category)
                ? current.filter((value) => value !== category)
                : [...current, category]
        ));
    };

    const handleExport = async (format: 'markdown' | 'json') => {
        if (!hasCurrentSession || exportingFormat || !currentSessionId) return;

        const markdownCategories = ['debater_speeches', ...markdownExportCategories] as MarkdownExportCategory[];
        const normalizedMarkdownCategories = Array.from(new Set(markdownCategories));
        if (format !== 'markdown') {
            setShowMarkdownExportOptions(false);
        }

        setExportingFormat(format);
        try {
            if (format === 'markdown') {
                await api.sessions.exportMarkdown(currentSessionId, currentTopic, normalizedMarkdownCategories);
                toast('已导出 Markdown 辩论记录', 'success');
                setShowMarkdownExportOptions(false);
            } else {
                await api.sessions.exportJson(currentSessionId, currentTopic);
                toast('已导出 JSON 辩论数据', 'success');
            }
        } catch (error) {
            console.error('Failed to export session:', error);
            toast(error instanceof Error ? error.message : '导出失败', 'error');
        } finally {
            setExportingFormat(null);
        }
    };

    const selectedMarkdownExportCategoryCount = markdownExportCategories.length;
    const markdownExportButtonLabel = selectedMarkdownExportCategoryCount > 0
        ? `导出 Markdown +${selectedMarkdownExportCategoryCount}`
        : '导出 Markdown';
    const markdownExportOptionPanelVisible = hasCurrentSession && showMarkdownExportOptions;

    return (
        <div
            ref={overlayRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 16,
                right: 16,
                zIndex: 30,
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    padding: '12px 0 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        pointerEvents: 'auto',
                    }}
                >
                    {isSidebarCollapsed && (
                        <SidebarExpandButton
                            onClick={onExpandSidebar}
                            variant={isSophistryMode ? 'sophistry' : 'default'}
                        />
                    )}

                    <motion.div
                        style={{
                            padding: '12px 16px',
                            background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                            borderRadius: 'var(--radius-xl)',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                            border: isSophistryMode
                                ? '1px solid var(--mode-sophistry-border)'
                                : '1px solid var(--border-subtle)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            flexWrap: 'wrap',
                            backdropFilter: 'blur(12px)',
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        <h2
                            style={{
                                fontSize: topicTitleFontSize,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                letterSpacing: '-0.01em',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: '1 1 240px',
                                minWidth: 0,
                                margin: 0,
                            }}
                        >
                            {hasCurrentSession ? currentTopic : 'Elenchus 辩论场'}
                        </h2>

                        {hasCurrentSession && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    flexShrink: 0,
                                }}
                            >
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '5px 12px',
                                        borderRadius: 'var(--radius-full)',
                                        background: isSophistryMode
                                            ? 'rgba(184, 137, 70, 0.14)'
                                            : 'var(--bg-tertiary)',
                                        color: isSophistryMode
                                            ? 'var(--mode-sophistry-accent)'
                                            : 'var(--text-secondary)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                    }}
                                >
                                    {isSophistryMode ? '诡辩实验模式' : '标准辩论'}
                                </span>
                                {transcriptCollapseSummary.hasAgentRows && (
                                    <motion.button
                                        whileHover={{ y: -1 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={onToggleAllAgentMessages}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '7px 12px',
                                            background: 'var(--bg-tertiary)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border-subtle)',
                                            borderRadius: 'var(--radius-full)',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                        }}
                                        title={bulkCollapseLabel}
                                    >
                                        {bulkCollapseLabel}
                                    </motion.button>
                                )}

                                {currentSessionId && (
                                    <ReferenceLibraryPanel
                                        currentSessionId={currentSessionId}
                                        isSophistryMode={isSophistryMode}
                                    />
                                )}

                                <div style={{ position: 'relative' }}>
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            borderRadius: 'var(--radius-full)',
                                            boxShadow: 'var(--shadow-xs)',
                                        }}
                                    >
                                        <motion.button
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                void handleExport('markdown');
                                            }}
                                            disabled={Boolean(exportingFormat)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 12px',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-full) 0 0 var(--radius-full)',
                                                cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                opacity: exportingFormat && exportingFormat !== 'markdown' ? 0.7 : 1,
                                            }}
                                            title="导出 Markdown 记录"
                                        >
                                            <FileText size={14} />
                                            {exportingFormat === 'markdown' ? '导出中...' : markdownExportButtonLabel}
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setShowMarkdownExportOptions((current) => !current)}
                                            disabled={!hasCurrentSession}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '7px 10px',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-subtle)',
                                                borderLeft: 'none',
                                                borderRadius: '0 var(--radius-full) var(--radius-full) 0',
                                                cursor: hasCurrentSession ? 'pointer' : 'default',
                                                opacity: hasCurrentSession ? 1 : 0.6,
                                            }}
                                            title={markdownExportOptionPanelVisible ? '收起 Markdown 选项' : '展开 Markdown 选项'}
                                        >
                                            <ChevronDown
                                                size={14}
                                                style={{
                                                    transform: markdownExportOptionPanelVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                                                    transition: 'transform var(--transition-fast)',
                                                }}
                                            />
                                        </motion.button>
                                    </div>

                                    {markdownExportOptionPanelVisible && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: 'calc(100% + 8px)',
                                                right: 0,
                                                minWidth: '220px',
                                                padding: '12px',
                                                borderRadius: 'var(--radius-xl)',
                                                background: 'var(--bg-card)',
                                                border: '1px solid var(--border-subtle)',
                                                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '10px',
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    Markdown 导出内容
                                                </span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                                    默认始终包含辩手发言，可额外附带讨论与评议内容。
                                                </span>
                                            </div>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    fontSize: '12px',
                                                    color: 'var(--text-secondary)',
                                                }}
                                            >
                                                <input type="checkbox" checked readOnly />
                                                <span>辩手发言（默认包含）</span>
                                            </label>
                                            {MARKDOWN_EXPORT_OPTIONS.map((option) => (
                                                <label
                                                    key={option.value}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '12px',
                                                        color: 'var(--text-secondary)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={markdownExportCategories.includes(option.value)}
                                                        onChange={() => toggleMarkdownExportCategory(option.value)}
                                                    />
                                                    <span>{option.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <motion.button
                                    whileHover={{ y: -1 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                        void handleExport('json');
                                    }}
                                    disabled={Boolean(exportingFormat)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 12px',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: 'var(--radius-full)',
                                        cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        opacity: exportingFormat && exportingFormat !== 'json' ? 0.7 : 1,
                                    }}
                                    title="导出 JSON 原始数据"
                                >
                                    <FileJson size={14} />
                                    {exportingFormat === 'json' ? '导出中...' : '导出 JSON'}
                                </motion.button>

                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '5px 12px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-full)',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: '6px',
                                            height: '6px',
                                            borderRadius: '50%',
                                            background: 'var(--accent-emerald)',
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: '12px',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 500,
                                        }}
                                    >
                                        {currentTurn} / {maxTurns} 轮
                                    </span>
                                </span>
                            </div>
                        )}
                    </motion.div>

                    {hasCurrentSession && isSophistryMode && (
                        <SophistryModeNotice artifactCount={modeArtifactsLength} />
                    )}

                    <div style={{ pointerEvents: 'auto' }}>
                        <StatusBanner />
                    </div>
                </div>
            </div>
        </div>
    );
}
