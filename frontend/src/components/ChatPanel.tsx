/**
 * ChatPanel — MAIN conversation view.
 * Renders dialogue history, live streaming bubbles, status banner, and inputs.
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../stores/debateStore';
import MessageRow from './chat/MessageRow';
import DebateControls from './chat/DebateControls';
import StatusBanner from './chat/StatusBanner';

export default function ChatPanel() {
    const {
        currentSession,
        streamingRole,
        streamingContent
    } = useDebateStore();

    // Auto-scroll to bottom of chat
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [currentSession?.dialogue_history, streamingContent, currentSession?.current_turn]);

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid var(--border-subtle)',
                minHeight: 0,
                background: 'var(--bg-primary)',
            }}
        >
            {/* Top header indicator */}
            <div style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600 }}>
                    {currentSession ? currentSession.topic : 'Elenchus — 辩论场'}
                </h2>
                {currentSession && (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        第 {currentSession.current_turn} / {currentSession.max_turns} 轮
                    </div>
                )}
            </div>

            {/* Dynamic Status Banner */}
            <StatusBanner />

            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    scrollBehavior: 'smooth',
                }}
            >
                {(() => {
                    const allEntries = [...(currentSession?.dialogue_history || [])];
                    if (streamingRole && !['system', 'error'].includes(streamingRole)) {
                        allEntries.push({
                            role: streamingRole,
                            content: streamingContent,
                            citations: [],
                            timestamp: '',
                            agent_name: streamingRole,
                            isStreaming: true,
                            streamingContent: streamingContent
                        } as any);
                    }

                    const rows: any[] = [];

                    for (const entry of allEntries) {
                        if (entry.role === 'proposer' || entry.role === 'opposer') {
                            rows.push({ agent: entry, judge: null });
                        } else if (entry.role === 'judge') {
                            let matched = false;
                            // Search backwards for the last row matching target_role that doesn't have a judge yet
                            for (let i = rows.length - 1; i >= 0; i--) {
                                if (rows[i].agent && rows[i].agent.role === entry.target_role && !rows[i].judge) {
                                    rows[i].judge = entry;
                                    matched = true;
                                    break;
                                }
                            }
                            // If no matching agent was found (rare edge case), render standalone
                            if (!matched) {
                                rows.push({ agent: null, judge: entry });
                            }
                        } else {
                            // System or error
                            rows.push({ system: entry });
                        }
                    }

                    return rows.map((row, idx) => (
                        <MessageRow
                            key={idx}
                            agentEntry={row.agent}
                            judgeEntry={row.judge}
                            systemEntry={row.system}
                        />
                    ));
                })()}

                {/* Fact-check spacer if it's currently searching but no agent speaking */}
                <div style={{ height: '20px' }} />
            </div>

            {/* Bottom Controls */}
            <DebateControls />
        </motion.section>
    );
}
