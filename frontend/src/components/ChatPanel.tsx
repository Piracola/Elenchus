/**
 * ChatPanel — MAIN conversation view.
 * Renders dialogue history, live streaming bubbles, status banner, and inputs.
 * Floating UI elements for immersive debate experience.
 */

import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../stores/debateStore';
import { useSettingsStore, MESSAGE_WIDTH_VALUES } from '../stores/settingsStore';
import MessageRow from './chat/MessageRow';
import DebateControls from './chat/DebateControls';
import StatusBanner from './chat/StatusBanner';
import { groupDialogue } from '../utils/groupDialogue';
import type { DialogueEntry } from '../types';

export default function ChatPanel() {
    const {
        currentSession,
        streamingRole,
        streamingContent
    } = useDebateStore();
    const { displaySettings } = useSettingsStore();

    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [currentSession?.dialogue_history, streamingContent, currentSession?.current_turn]);

    const rows = useMemo(() => {
        const history = currentSession?.dialogue_history || [];
        const allEntries: DialogueEntry[] = [...history];
        if (streamingRole && !['system', 'error'].includes(streamingRole)) {
            const lastHistoryEntry = history[history.length - 1];
            const isStreamingDuplicate = lastHistoryEntry &&
                lastHistoryEntry.role === streamingRole &&
                lastHistoryEntry.content === streamingContent;
            if (!isStreamingDuplicate) {
                allEntries.push({
                    role: streamingRole,
                    content: streamingContent,
                    citations: [],
                    timestamp: '',
                    agent_name: streamingRole,
                } as DialogueEntry);
            }
        }
        return groupDialogue(allEntries, currentSession?.participants);
    }, [currentSession?.dialogue_history, currentSession?.participants, streamingRole, streamingContent]);

    const maxWidthValue = MESSAGE_WIDTH_VALUES[displaySettings.messageWidth];

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
                background: 'var(--bg-primary)',
                position: 'relative',
            }}
        >
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                maxWidth: maxWidthValue,
                margin: '0 auto',
                width: '100%',
                padding: '0 16px',
                minHeight: 0,
            }}>
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    background: 'var(--bg-primary)',
                    padding: '12px 0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <motion.div style={{
                        padding: '12px 16px',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-xl)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backdropFilter: 'blur(12px)',
                        flex: 1,
                        minWidth: 0,
                    }}>
                        <h2 style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.01em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '70%',
                            margin: 0,
                        }}>
                            {currentSession ? currentSession.topic : 'Elenchus — 辩论场'}
                        </h2>
                        {currentSession && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '5px 12px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-full)',
                                flexShrink: 0,
                            }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-emerald)',
                                }} />
                                <span style={{
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                    fontWeight: 500,
                                }}>
                                    {currentSession.current_turn} / {currentSession.max_turns} 轮
                                </span>
                            </div>
                        )}
                    </motion.div>
                    <StatusBanner />
                </div>

                <div
                    ref={scrollRef}
                    style={{
                        flex: '1 1 0',
                        minHeight: 0,
                        overflowY: 'auto',
                        padding: '12px 4px',
                        display: 'flex',
                        flexDirection: 'column',
                        scrollBehavior: 'smooth',
                        gap: '10px',
                    }}
                >
                    {rows.map((row, idx) => {
                        const agentKey = row.agent?.timestamp || `agent-${idx}`;
                        const judgeKey = row.judge?.timestamp || `judge-${idx}`;
                        return (
                            <MessageRow
                                key={`${agentKey}-${judgeKey}`}
                                agentEntry={row.agent}
                                judgeEntry={row.judge}
                                systemEntry={row.system}
                            />
                        );
                    })}
                    <div style={{ height: '80px' }} />
                </div>

                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: 'var(--bg-primary)',
                    padding: '8px 0 12px',
                }}>
                    <DebateControls />
                </div>
            </div>
        </motion.section>
    );
}
