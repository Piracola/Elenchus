import { useEffect, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, FileText, Users } from 'lucide-react';
import { api } from '../../api/client';
import type { MarkdownExportCategory } from '../../types';
import { toast } from '../../utils/toast';
import StatusBanner from './StatusBanner';
import ReferenceLibraryPanel from './ReferenceLibraryPanel';
import SidebarExpandButton from '../shared/SidebarExpandButton';
import DebaterSettingsModal from './DebaterSettingsModal';

const MARKDOWN_EXPORT_OPTIONS: { value: MarkdownExportCategory; label: string }[] = [
    { value: 'group_discussion', label: '组内讨论' },
    { value: 'judge_messages', label: '裁判消息' },
    { value: 'jury_messages', label: '陪审团消息' },
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
    topicTitleFontSize,
    transcriptCollapseSummary,
    bulkCollapseLabel,
    onToggleAllAgentMessages,
}: ChatHeaderOverlayProps) {
    const [exportingFormat, setExportingFormat] = useState<'markdown' | 'json' | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showDebaterSettings, setShowDebaterSettings] = useState(false);
    const [markdownExportCategories, setMarkdownExportCategories] = useState<MarkdownExportCategory[]>([]);

    useEffect(() => {
        setShowExportMenu(false);
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

        setExportingFormat(format);
        try {
            if (format === 'markdown') {
                await api.sessions.exportMarkdown(currentSessionId, currentTopic, normalizedMarkdownCategories);
                toast('已导出 Markdown 辩论记录', 'success');
                setShowExportMenu(false);
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

    return (
        <div
            ref={overlayRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 16,
                right: 16,
                zIndex: 100,
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
                {/* 第一行：标准辩论 + 辩题 + 状态指示器 */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
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
                            padding: '8px 16px',
                            background: isSophistryMode ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                            borderRadius: 'var(--radius-xl)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            border: isSophistryMode
                                ? '1px solid var(--mode-sophistry-border)'
                                : '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        {hasCurrentSession && (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'var(--bg-tertiary)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    flexShrink: 0,
                                }}
                            >
                                {isSophistryMode ? '诡辩' : '标准'}
                            </span>
                        )}

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

                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '4px 8px',
                                background: '#FFFFFF',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-lg)',
                                flexShrink: 0,
                            }}
                        >
                            <StatusBanner />
                        </div>
                    </motion.div>
                </div>

                {/* 第二行：轮次、按钮等 */}
                {hasCurrentSession && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap',
                            pointerEvents: 'auto',
                        }}
                    >
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
                                    background: '#FFFFFF',
                                    color: '#1D1D1F',
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

                        <motion.button
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowDebaterSettings(true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 12px',
                                background: '#FFFFFF',
                                color: '#1D1D1F',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-full)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                            }}
                            title="辩手设置"
                        >
                            <Users size={14} />
                            辩手设置
                        </motion.button>

                        <div style={{ position: 'relative' }}>
                            <motion.button
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setShowExportMenu((current) => !current)}
                                disabled={Boolean(exportingFormat)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 12px',
                                    background: '#FFFFFF',
                                    color: '#1D1D1F',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-full)',
                                    cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    opacity: exportingFormat ? 0.7 : 1,
                                }}
                                title="导出辩论记录"
                            >
                                <FileText size={14} />
                                导出
                                <ChevronDown
                                    size={12}
                                    style={{
                                        transform: showExportMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform var(--transition-fast)',
                                    }}
                                />
                            </motion.button>

                            {showExportMenu && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 8px)',
                                        left: 0,
                                        minWidth: '240px',
                                        padding: '14px',
                                        borderRadius: 'var(--radius-xl)',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-subtle)',
                                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        zIndex: 50,
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            导出辩论记录
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            选择导出格式与内容范围。
                                        </span>
                                    </div>

                                    {/* Markdown 选项 */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Markdown
                                            </span>
                                            <motion.button
                                                whileHover={{ y: -1 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    void handleExport('markdown');
                                                    setShowExportMenu(false);
                                                }}
                                                disabled={Boolean(exportingFormat)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '5px 10px',
                                                    background: 'var(--text-primary)',
                                                    color: 'var(--bg-primary)',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    opacity: exportingFormat ? 0.65 : 1,
                                                }}
                                            >
                                                {exportingFormat === 'markdown' ? '导出中...' : '导出'}
                                            </motion.button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '11px',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                <input type="checkbox" checked readOnly />
                                                <span>辩手发言（默认）</span>
                                            </label>
                                            {MARKDOWN_EXPORT_OPTIONS.map((option) => (
                                                <label
                                                    key={option.value}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '11px',
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
                                    </div>

                                    {/* 分隔线 */}
                                    <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                                    {/* JSON 选项 */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            JSON
                                        </span>
                                        <motion.button
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                void handleExport('json');
                                                setShowExportMenu(false);
                                            }}
                                            disabled={Boolean(exportingFormat)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '5px 10px',
                                                background: 'var(--text-primary)',
                                                color: 'var(--bg-primary)',
                                                border: 'none',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: exportingFormat ? 'not-allowed' : 'pointer',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                opacity: exportingFormat ? 0.65 : 1,
                                            }}
                                        >
                                            {exportingFormat === 'json' ? '导出中...' : '导出'}
                                        </motion.button>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                                        包含完整原始数据结构，适合程序处理。
                                    </span>
                                </div>
                            )}
                        </div>

                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '5px 12px',
                                background: '#FFFFFF',
                                color: '#1D1D1F',
                                borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border-subtle)',
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
                                    fontWeight: 500,
                                }}
                            >
                                {currentTurn} / {maxTurns} 轮
                            </span>
                        </span>
                    </div>
                )}
            </div>

            {/* 辩手设置弹窗 */}
            {currentSessionId && (
                <DebaterSettingsModal
                    isOpen={showDebaterSettings}
                    onClose={() => setShowDebaterSettings(false)}
                    sessionId={currentSessionId}
                />
            )}
        </div>
    );
}
