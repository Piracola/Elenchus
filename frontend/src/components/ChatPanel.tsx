/**
 * ChatPanel - main conversation view shell.
 * Orchestrates transcript state, history virtualization, overlays, and the runtime inspector.
 */

import { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getMessageFontTokens } from '../config/display';
import { useFloatingInspectorState } from '../hooks/chat/useFloatingInspectorState';
import { useChatHistoryWindow } from '../hooks/chat/useChatHistoryWindow';
import { useChatViewportMetrics } from '../hooks/chat/useChatViewportMetrics';
import { useTranscriptPanelState } from '../hooks/chat/useTranscriptPanelState';
import { useTranscriptActions } from '../hooks/useDebateViewState';
import { useSettingsStore, MESSAGE_WIDTH_VALUES } from '../stores/settingsStore';
import DebateControls from './chat/DebateControls';
import ChatHeaderOverlay from './chat/ChatHeaderOverlay';
import ChatHistoryList from './chat/ChatHistoryList';
import FloatingRuntimeInspector from './chat/FloatingRuntimeInspector';
import RuntimeInspector from './chat/RuntimeInspector';

const HISTORY_ROW_PRELOAD_THRESHOLD = 240;

interface ChatPanelProps {
    isSidebarCollapsed: boolean;
    onExpandSidebar: () => void;
}

export default function ChatPanel({ isSidebarCollapsed, onExpandSidebar }: ChatPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const topOverlayRef = useRef<HTMLDivElement>(null);
    const bottomOverlayRef = useRef<HTMLDivElement>(null);
    const { displaySettings } = useSettingsStore();
    const {
        currentSessionId,
        currentTopic,
        debateMode,
        currentTurn,
        maxTurns,
        hasCurrentSession,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistoryLength,
        teamDialogueHistoryLength,
        juryDialogueHistoryLength,
        replayEnabled,
        focusedRuntimeEventId,
        collapsedAgentMessages,
        transcriptViewModel,
        transcriptCollapseSummary,
        bulkCollapseLabel,
        handleToggleAllAgentMessages,
    } = useTranscriptPanelState();
    const { toggleAgentMessageCollapsed } = useTranscriptActions();

    const viewportMetrics = useChatViewportMetrics({
        currentSessionId,
        replayEnabled,
        isDocumentVisible,
        visibilityResumeToken,
        dialogueHistoryLength,
        teamDialogueHistoryLength,
        juryDialogueHistoryLength,
        currentTurn,
        scrollRef,
        topOverlayRef,
        bottomOverlayRef,
    });

    const historyWindow = useChatHistoryWindow({
        currentSessionId,
        replayEnabled,
        focusedRuntimeEventId,
        transcriptViewModel,
        scrollRef,
        scrollTop: viewportMetrics.scrollTop,
        viewportHeight: viewportMetrics.viewportHeight,
        smoothScrollSuppressed: viewportMetrics.smoothScrollSuppressed,
    });

    const floatingInspector = useFloatingInspectorState({
        panelRef,
        messageWidth: displaySettings.messageWidth,
        topOverlayHeight: viewportMetrics.topOverlayHeight,
    });

    const isSophistryMode = debateMode === 'sophistry_experiment';
    const panelMaxWidth = MESSAGE_WIDTH_VALUES[displaySettings.messageWidth];
    const messageFontSize = displaySettings.messageFontSize ?? 15;
    const chatFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).chat, [messageFontSize]);

    const handleScroll = () => {
        viewportMetrics.handleScroll();

        const container = scrollRef.current;
        if (!container || replayEnabled) {
            return;
        }

        if (
            historyWindow.hiddenHistoryRowCount > 0
            && container.scrollTop <= HISTORY_ROW_PRELOAD_THRESHOLD
        ) {
            historyWindow.loadOlderHistoryRows();
        }
    };

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
                    ? 'linear-gradient(180deg, var(--mode-sophistry-bg) 0%, rgba(252, 250, 248, 0.92) 100%)'
                    : 'var(--bg-primary)',
                position: 'relative',
            }}
        >
            <div
                ref={panelRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: panelMaxWidth,
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
                    currentTopic={currentTopic}
                    currentTurn={currentTurn}
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
                    {!floatingInspector.isWideLayout && (
                        <div style={{ flex: '0 0 auto', minWidth: 0 }}>
                            <RuntimeInspector key="inline-inspector" />
                        </div>
                    )}

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
                        consensusFocused={historyWindow.consensusFocused}
                    />
                </div>

                {floatingInspector.isWideLayout && (
                    <FloatingRuntimeInspector
                        floatingInspectorRect={floatingInspector.floatingInspectorRect}
                        floatingInspectorExpanded={floatingInspector.floatingInspectorExpanded}
                        floatingInspectorActive={floatingInspector.floatingInspectorActive}
                        floatingInspectorInteractionRef={floatingInspector.floatingInspectorInteractionRef}
                        onMoveStart={floatingInspector.handleFloatingInspectorMoveStart}
                        onResizeStart={floatingInspector.handleFloatingInspectorResizeStart}
                        onExpandedChange={floatingInspector.handleFloatingInspectorExpandedChange}
                    />
                )}

                <div
                    ref={bottomOverlayRef}
                    style={{
                        position: 'absolute',
                        left: 16,
                        right: 16,
                        bottom: 0,
                        zIndex: 30,
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
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
