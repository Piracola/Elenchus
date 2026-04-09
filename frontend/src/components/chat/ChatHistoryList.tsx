import type { RefObject } from 'react';
import { useMemo } from 'react';
import { useConnectionViewState } from '../../hooks/useDebateViewState';
import type { DialogueEntry } from '../../types';
import MessageRow from './MessageRow';
import RoundInsights from './RoundInsights';
import StreamingMessage from './StreamingMessage';
import type { VirtualVariableWindow } from '../../utils/virtualization/virtualWindow';
import type { TranscriptRowViewModel } from '../../utils/chat/transcriptViewModel';
import { isTranscriptAgentMessageCollapsed } from '../../utils/chat/transcriptViewModel';

type ChatHistoryListProps = {
    scrollRef: RefObject<HTMLDivElement | null>;
    topOverlayHeight: number;
    bottomOverlayHeight: number;
    smoothScrollSuppressed: boolean;
    handleScroll: () => void;
    hiddenHistoryRowCount: number;
    loadOlderHistoryRows: () => void;
    virtualWindow: VirtualVariableWindow;
    virtualRows: TranscriptRowViewModel[];
    renderedRowCount: number;
    setMeasuredRow: (key: string) => (node: HTMLDivElement | null) => void;
    currentSessionId: string | null;
    collapsedAgentMessages: Record<string, boolean>;
    toggleAgentMessageCollapsed: (sessionId: string, collapseKey: string) => void;
    consensusEntries: DialogueEntry[];
    consensusFocused: boolean;
};

export default function ChatHistoryList({
    scrollRef,
    topOverlayHeight,
    bottomOverlayHeight,
    smoothScrollSuppressed,
    handleScroll,
    hiddenHistoryRowCount,
    loadOlderHistoryRows,
    virtualWindow,
    virtualRows,
    renderedRowCount,
    setMeasuredRow,
    currentSessionId,
    collapsedAgentMessages,
    toggleAgentMessageCollapsed,
    consensusEntries,
    consensusFocused,
}: ChatHistoryListProps) {
    // Get agent_configs from current session to resolve model info
    const { currentSession } = useConnectionViewState();
    const agentConfigs = currentSession?.agent_configs || {};

    // Build a model lookup map: role -> model name
    const modelByRole = useMemo(() => {
        const map: Record<string, string> = {};
        for (const [role, config] of Object.entries(agentConfigs)) {
            if (config?.model) {
                map[role] = config.model;
            }
        }
        return map;
    }, [agentConfigs]);

    return (
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
                flex: '1 1 0',
                minWidth: 0,
                minHeight: 0,
                overflowY: 'auto',
                paddingTop: `${topOverlayHeight + 12}px`,
                paddingRight: '4px',
                paddingLeft: '4px',
                paddingBottom: `${bottomOverlayHeight + 32}px`,
                display: 'flex',
                flexDirection: 'column',
                scrollBehavior: smoothScrollSuppressed ? 'auto' : 'smooth',
                gap: '10px',
            }}
        >
            {hiddenHistoryRowCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '8px' }}>
                    <button
                        type="button"
                        onClick={loadOlderHistoryRows}
                        style={{
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-secondary)',
                            borderRadius: 'var(--radius-full)',
                            padding: '10px 14px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-xs)',
                        }}
                    >
                        {`已折叠更早的 ${hiddenHistoryRowCount} 条消息，向上滚动或点击继续加载`}
                    </button>
                </div>
            )}

            <div style={{ height: `${virtualWindow.paddingTop}px`, flexShrink: 0 }} />
            {virtualRows.map((viewModel, index) => {
                const renderedIndex = virtualWindow.startIndex + index;
                const rowFocused = viewModel.focus.agent || viewModel.focus.judge || viewModel.focus.system;
                const animated = rowFocused || renderedIndex >= Math.max(0, renderedRowCount - 3);

                return (
                    <div key={viewModel.key} ref={setMeasuredRow(viewModel.key)}>
                        <div data-row-focused={rowFocused ? 'true' : 'false'}>
                            <MessageRow
                                agentEntry={viewModel.row.agent}
                                judgeEntry={viewModel.row.judge}
                                systemEntry={viewModel.row.system}
                                highlightAgent={viewModel.focus.agent}
                                highlightJudge={viewModel.focus.judge}
                                highlightSystem={viewModel.focus.system}
                                insightSections={viewModel.insightSections}
                                animated={animated}
                                agentCollapsed={isTranscriptAgentMessageCollapsed(viewModel.agentCollapseKey, collapsedAgentMessages)}
                                onToggleAgentCollapsed={viewModel.agentCollapseKey && currentSessionId
                                    ? () => toggleAgentMessageCollapsed(currentSessionId, viewModel.agentCollapseKey as string)
                                    : undefined}
                                agentModel={viewModel.row.agent?.role ? modelByRole[viewModel.row.agent.role] : undefined}
                            />
                        </div>
                        {!!viewModel.jurySections.length && (
                            <div data-row-focused={viewModel.juryFocused ? 'true' : 'false'}>
                                <RoundInsights sections={viewModel.jurySections} />
                            </div>
                        )}
                    </div>
                );
            })}
            <div style={{ height: `${virtualWindow.paddingBottom}px`, flexShrink: 0 }} />

            {!!consensusEntries.length && (
                <div data-row-focused={consensusFocused ? 'true' : 'false'}>
                    <RoundInsights
                        sections={[
                            {
                                key: 'consensus-summary',
                                title: '辩论结束后的共识收敛',
                                accent: 'var(--accent-cyan)',
                                entries: consensusEntries,
                            },
                        ]}
                    />
                </div>
            )}

            {/* 流式消息：实时显示辩手发言内容 */}
            <StreamingMessage />
        </div>
    );
}
