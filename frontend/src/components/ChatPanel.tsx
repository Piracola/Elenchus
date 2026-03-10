/**
 * ChatPanel — MAIN conversation view.
 * Renders dialogue history, live streaming bubbles, status banner, and inputs.
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../stores/debateStore';
import MessageBubble from './chat/MessageBubble';
import DebateControls from './chat/DebateControls';
import StatusBanner from './chat/StatusBanner';

export default function ChatPanel() {
    const {
        currentSession,
        currentSessionId,
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
                background: 'rgba(10, 10, 15, 0.4)',
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

            {/* Scrollable messages area */}
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
                {!currentSessionId ? (
                    // Empty state
                    <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: '16px',
                        color: 'var(--text-muted)',
                    }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px',
                        }}>
                            ⚔️
                        </div>
                        <p style={{ fontSize: '14px' }}>从左侧选择或在下方创建一个新的辩论 Session</p>
                    </div>
                ) : (
                    <>
                        {/* History */}
                        {currentSession?.dialogue_history.map((entry, idx) => (
                            <MessageBubble key={idx} entry={entry} />
                        ))}

                        {/* Active Streaming Bubble */}
                        {streamingRole && (
                            <MessageBubble
                                isStreaming
                                streamingRole={streamingRole}
                                streamingContent={streamingContent}
                            />
                        )}

                        {/* Fact-check spacer if it's currently searching but no agent speaking */}
                        <div style={{ height: '20px' }} />
                    </>
                )}
            </div>

            {/* Bottom Controls */}
            <DebateControls />
        </motion.section>
    );
}
