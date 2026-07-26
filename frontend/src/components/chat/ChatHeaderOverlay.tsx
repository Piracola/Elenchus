import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FileText, Users } from 'lucide-react';
import { api } from '../../api/client';
import type { MarkdownExportCategory } from '../../types';
import { toast } from '../../utils/chat/toast';
import StatusBanner from './StatusBanner';
import TokenUsageChip from './TokenUsageChip';
import ReferenceLibraryPanel from './ReferenceLibraryPanel';
import SidebarExpandButton from '../shared/SidebarExpandButton';
import DebaterSettingsModal from './DebaterSettingsModal';
import {
  HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE,
  HEADER_TOOLBAR_BUTTON_STYLE,
  HEADER_TOOLBAR_PANEL_STYLE,
  HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
} from './toolbarStyles';

const EXPORT_CONTENT_OPTIONS: { value: MarkdownExportCategory; label: string }[] = [
  { value: 'thinking_content', label: '思维链' },
  { value: 'group_discussion', label: '组内讨论' },
  { value: 'judge_messages', label: '裁判消息' },
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
  activeRunId?: string | null;
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
  activeRunId = null,
  currentTopic,
  currentTurn,
  maxTurns,
  isSophistryMode,
  topicTitleFontSize,
  transcriptCollapseSummary,
  bulkCollapseLabel,
  onToggleAllAgentMessages,
}: ChatHeaderOverlayProps) {
  const [exportingFormat, setExportingFormat] = useState<'markdown' | 'json' | 'html' | 'video' | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showDebaterSettings, setShowDebaterSettings] = useState(false);
  const [exportCategories, setExportCategories] = useState<MarkdownExportCategory[]>([]);
  const debaterSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setShowExportMenu(false);
    setExportCategories([]);
  }, [currentSessionId]);

  useEffect(() => {
    if (!showExportMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (exportButtonRef.current?.contains(target) || exportMenuRef.current?.contains(target)) {
        return;
      }
      setShowExportMenu(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExportMenu(false);
      }
    };

    const timerId = window.setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExportMenu]);

  const toggleExportCategory = (category: MarkdownExportCategory) => {
    setExportCategories((current) => (
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category]
    ));
  };

  const handleExport = async (format: 'markdown' | 'json' | 'html') => {
    if (!hasCurrentSession || exportingFormat || !currentSessionId) {
      return;
    }

    const selectedCategories = ['debater_speeches', ...exportCategories] as MarkdownExportCategory[];
    const normalizedExportCategories = Array.from(new Set(selectedCategories));

    setExportingFormat(format);
    try {
      if (format === 'markdown') {
        await api.sessions.exportMarkdown(currentSessionId, currentTopic, normalizedExportCategories, activeRunId);
        toast('已导出 Markdown 辩论记录', 'success');
      } else if (format === 'html') {
        await api.sessions.exportHtml(currentSessionId, currentTopic, normalizedExportCategories, activeRunId);
        toast('已导出 HTML 阅读页', 'success');
      } else {
        await api.sessions.exportJson(currentSessionId, currentTopic, activeRunId);
        toast('已导出 JSON 辩论数据', 'success');
      }
      setShowExportMenu(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : '导出失败', 'error');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleSendToVideo = async () => {
    if (!hasCurrentSession || exportingFormat || !currentSessionId) {
      return;
    }
    setExportingFormat('video');
    try {
      const result = await api.sessions.sendToVideo(currentSessionId, activeRunId);
      result.warnings?.forEach((warning: string) => toast(warning));
      toast(`已送入视频生成器（${result.speech_count} 条发言）`, 'success');
      setShowExportMenu(false);
      window.open(result.video_ui_url, '_blank', 'noopener');
    } catch (error) {
      // The renderer runs as a separate local tool; a 503 means it is not up.
      toast(error instanceof Error ? error.message : '发送到视频生成器失败', 'error');
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
        zIndex: 400,
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
                minWidth: 0,
                maxWidth: 'min(48vw, 540px)',
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
              alignItems: 'flex-start',
              gap: '8px',
              flexWrap: 'wrap',
              pointerEvents: 'auto',
            }}
          >
              {transcriptCollapseSummary.hasAgentRows && (
                <motion.button
                  whileHover={{ opacity: 0.92 }}
                  whileTap={{ opacity: 0.82 }}
                  onClick={onToggleAllAgentMessages}
                  style={{
                    ...HEADER_TOOLBAR_BUTTON_STYLE,
                  }}
                  title={bulkCollapseLabel}
                >
                  {bulkCollapseLabel}
                </motion.button>
              )}

              <TokenUsageChip />

              {currentSessionId && (
                <ReferenceLibraryPanel
                  currentSessionId={currentSessionId}
                  isSophistryMode={isSophistryMode}
                />
              )}

              <motion.button
                ref={debaterSettingsButtonRef}
                whileHover={{ opacity: 0.92 }}
                whileTap={{ opacity: 0.82 }}
                onClick={() => setShowDebaterSettings((current) => !current)}
                style={{
                  ...HEADER_TOOLBAR_BUTTON_STYLE,
                  ...(showDebaterSettings ? HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE : null),
                }}
                title="辩手设置"
              >
                <Users size={14} />
                辩手设置
              </motion.button>

              {/* 导出按钮和下拉菜单 */}
              <div style={{ position: 'relative' }}>
                <motion.button
                  ref={exportButtonRef}
                  whileHover={{ opacity: 0.92 }}
                  whileTap={{ opacity: 0.82 }}
                  onClick={() => setShowExportMenu((current) => !current)}
                  disabled={Boolean(exportingFormat)}
                  style={{
                    ...HEADER_TOOLBAR_BUTTON_STYLE,
                    ...(showExportMenu ? HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE : null),
                    cursor: exportingFormat ? 'not-allowed' : HEADER_TOOLBAR_BUTTON_STYLE.cursor,
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

                <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    ref={exportMenuRef}
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      minWidth: '240px',
                      padding: '14px',
                      ...HEADER_TOOLBAR_PANEL_STYLE,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      zIndex: 1000,
                      transformOrigin: 'top left',
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

                  {/* 内容范围 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      内容范围
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '2px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <input type="checkbox" checked readOnly style={{ pointerEvents: 'none' }} />
                        <span>辩手发言（默认）</span>
                      </div>
                      {EXPORT_CONTENT_OPTIONS.map((option) => (
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
                            checked={exportCategories.includes(option.value)}
                            onChange={() => toggleExportCategory(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 分隔线 */}
                  <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                  {/* Markdown 部分 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: '28px',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Markdown
                      </span>
                      <motion.button
                        whileHover={{ opacity: 0.9 }}
                        whileTap={{ opacity: 0.8 }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowExportMenu(false);
                          void handleExport('markdown');
                        }}
                        disabled={Boolean(exportingFormat)}
                        style={{
                          ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                          padding: '5px 10px',
                          fontSize: '11px',
                          opacity: exportingFormat ? 0.65 : 1,
                        }}
                      >
                        {exportingFormat === 'markdown' ? '导出中...' : '导出'}
                      </motion.button>
                    </div>
                  </div>

                  {/* 分隔线 */}
                  <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                  {/* HTML 选项 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        HTML 网页
                      </span>
                      <motion.button
                        whileHover={{ opacity: 0.9 }}
                        whileTap={{ opacity: 0.8 }}
                        onClick={() => {
                          void handleExport('html');
                          setShowExportMenu(false);
                        }}
                        disabled={Boolean(exportingFormat)}
                        style={{
                          ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                          padding: '5px 10px',
                          fontSize: '11px',
                          opacity: exportingFormat ? 0.65 : 1,
                        }}
                      >
                        {exportingFormat === 'html' ? '导出中...' : '导出'}
                      </motion.button>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                      使用上方内容范围生成静态网页，支持收起、展开和轮次跳转。
                    </span>
                  </div>

                  {/* 分隔线 */}
                  <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                  {/* JSON 选项 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      JSON
                    </span>
                    <motion.button
                      whileHover={{ opacity: 0.9 }}
                      whileTap={{ opacity: 0.8 }}
                      onClick={() => {
                        void handleExport('json');
                        setShowExportMenu(false);
                      }}
                      disabled={Boolean(exportingFormat)}
                      style={{
                        ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                        padding: '5px 10px',
                        fontSize: '11px',
                        opacity: exportingFormat ? 0.65 : 1,
                      }}
                    >
                      {exportingFormat === 'json' ? '导出中...' : '导出'}
                    </motion.button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                    包含完整原始数据结构，适合程序处理。
                  </span>

                  {/* 分隔线 */}
                  <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                  {/* 视频生成器 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      生成视频
                    </span>
                    <motion.button
                      whileHover={{ opacity: 0.9 }}
                      whileTap={{ opacity: 0.8 }}
                      onClick={() => {
                        void handleSendToVideo();
                      }}
                      disabled={Boolean(exportingFormat)}
                      style={{
                        ...HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE,
                        padding: '5px 10px',
                        fontSize: '11px',
                        opacity: exportingFormat ? 0.65 : 1,
                      }}
                    >
                      {exportingFormat === 'video' ? '发送中...' : '发送'}
                    </motion.button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                    把本场辩论送入本地视频生成器（需先运行 video/启动视频生成器.bat），随后在其网页中配音并渲染。
                  </span>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
              <div style={{ marginLeft: 'auto' }} />

              <span
                style={{
                  ...HEADER_TOOLBAR_BUTTON_STYLE,
                  gap: '8px',
                  cursor: 'default',
                  minHeight: '32px',
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
          anchorRef={debaterSettingsButtonRef}
        />
      )}
    </div>
  );
}
