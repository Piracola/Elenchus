/**
 * ChatPanel - main conversation view shell.
 * Orchestrates transcript state, history virtualization, overlays, and the runtime inspector.
 */

import { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getMessageFontTokens } from '../config/display';
import { useChatHistoryWindow } from '../hooks/chat/useChatHistoryWindow';
import { useChatViewportMetrics } from '../hooks/chat/useChatViewportMetrics';
import { useTranscriptPanelState } from '../hooks/chat/useTranscriptPanelState';
import { useTranscriptActions } from '../hooks/useDebateViewState';
import { useDebateStore } from '../stores/debateStore';
import { useSettingsStore, MESSAGE_WIDTH_VALUES, MESSAGE_MEASURE_VALUES } from '../stores/settingsStore';
import DebateControls from './chat/DebateControls';
import ChatHeaderOverlay from './chat/ChatHeaderOverlay';
import ChatHistoryList from './chat/ChatHistoryList';

const HISTORY_ROW_PRELOAD_THRESHOLD = 240;

interface ChatPanelProps {
    isSidebarCollapsed: boolean;
    onExpandSidebar: () => void;
}

export default function ChatPanel({ isSidebarCollapsed, onExpandSidebar }: ChatPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const topOverlayRef = useRef<HTMLDivElement>(null);
    const bottomOverlayRef = useRef<HTMLDivElement>(null);
    const { displaySettings } = useSettingsStore();
    const {
        currentSessionId,
        currentTopic,
        debateMode,
        currentTurn,
        displayTurn,
        maxTurns,
        hasCurrentSession,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistoryLength,
        collapsedAgentMessages,
        transcriptViewModel,
        transcriptCollapseSummary,
        bulkCollapseLabel,
        handleToggleAllAgentMessages,
    } = useTranscriptPanelState();
    const { toggleAgentMessageCollapsed } = useTranscriptActions();
    const activeRunId = useDebateStore((state) => state.activeRunId);

    const viewportMetrics = useChatViewportMetrics({
        currentSessionId,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistoryLength,
        currentTurn,
        scrollRef,
        topOverlayRef,
        bottomOverlayRef,
    });

    const historyWindow = useChatHistoryWindow({
        currentSessionId,
        transcriptViewModel,
        scrollRef,
        scrollTop: viewportMetrics.scrollTop,
        viewportHeight: viewportMetrics.viewportHeight,
    });

    const isSophistryMode = debateMode === 'sophistry_experiment';
    const panelMaxWidth = MESSAGE_WIDTH_VALUES[displaySettings.messageWidth];
    const panelMeasure = MESSAGE_MEASURE_VALUES[displaySettings.messageWidth];
    const messageFontSize = displaySettings.messageFontSize ?? 15;
    const chatFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).chat, [messageFontSize]);

    const handleScroll = () => {
        viewportMetrics.handleScroll();

        const container = scrollRef.current;
        if (!container) {
            return;
        }

        if (
            historyWindow.hiddenHistoryRowCount > 0
            && container.scrollTop <= HISTORY_ROW_PRELOAD_THRESHOLD
        ) {
            historyWindow.loadOlderHistoryRows();
        }
    };

    const scrimColor = isSophistryMode ? 'var(--mode-sophistry-bg)' : 'var(--surface-page)';

    return (
        <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                background: isSophistryMode
                    ? 'var(--mode-sophistry-bg)'
                    : 'var(--surface-page)',
                position: 'relative',
            }}
        >
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: panelMaxWidth,
                    // Scoped override: the reading measure follows the width
                    // setting inside the transcript only, leaving the global
                    // token alone for the rest of the app.
                    ['--measure-reading' as string]: panelMeasure,
                    margin: '0 auto',
                    width: '100%',
                    padding: '0 16px',
                    minHeight: 0,
                    position: 'relative',
                }}
            >
                <ChatHeaderOverlay
                    overlayRef={topOverlayRef}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onExpandSidebar={onExpandSidebar}
                    hasCurrentSession={hasCurrentSession}
                    currentSessionId={currentSessionId}
                    activeRunId={activeRunId}
                    currentTopic={currentTopic}
                    currentTurn={displayTurn}
                    maxTurns={maxTurns}
                    isSophistryMode={isSophistryMode}
                    topicTitleFontSize={chatFontSizes.topicTitle}
                    transcriptCollapseSummary={transcriptCollapseSummary}
                    bulkCollapseLabel={bulkCollapseLabel}
                    onToggleAllAgentMessages={handleToggleAllAgentMessages}
                />

                <div
                    style={{
                        flex: '1 1 0',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                    }}
                >
                    <ChatHistoryList
                        scrollRef={scrollRef}
                        topOverlayHeight={viewportMetrics.topOverlayHeight}
                        bottomOverlayHeight={viewportMetrics.bottomOverlayHeight}
                        smoothScrollSuppressed={viewportMetrics.smoothScrollSuppressed}
                        handleScroll={handleScroll}
                        hiddenHistoryRowCount={historyWindow.hiddenHistoryRowCount}
                        loadOlderHistoryRows={historyWindow.loadOlderHistoryRows}
                        virtualWindow={historyWindow.virtualWindow}
                        virtualRows={historyWindow.virtualRows}
                        renderedRowCount={historyWindow.renderedRowViewModels.length}
                        setMeasuredRow={historyWindow.setMeasuredRow}
                        currentSessionId={currentSessionId}
                        collapsedAgentMessages={collapsedAgentMessages}
                        toggleAgentMessageCollapsed={toggleAgentMessageCollapsed}
                        consensusEntries={historyWindow.consensusEntries}
                        liveTranscript={historyWindow.liveTranscript}
                    />
                </div>

                <div
                    ref={bottomOverlayRef}
                    style={{
                        position: 'absolute',
                        left: 16,
                        right: 16,
                        bottom: 0,
                        zIndex: 'var(--z-raised)',
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            left: -16,
                            right: -16,
                            bottom: 0,
                            height: 'calc(100% + 28px)',
                            background: `linear-gradient(180deg, transparent 0%, ${scrimColor} 62%)`,
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        style={{
                            position: 'relative',
                            padding: '8px 0 12px',
                            display: 'flex',
                            justifyContent: 'center',
                            pointerEvents: 'auto',
                        }}
                    >
                        <DebateControls />
                    </div>
                </div>
            </div>
        </motion.section>
    );
}
