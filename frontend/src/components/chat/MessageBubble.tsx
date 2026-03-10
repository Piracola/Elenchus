/**
 * MessageBubble — renders a single dialogue entry or the active streaming token buffer.
 */

import { motion } from 'framer-motion';
import type { DialogueEntry } from '../../types';

interface MessageBubbleProps {
    entry?: DialogueEntry;
    streamingRole?: string;
    streamingContent?: string;
    isStreaming?: boolean;
}

export default function MessageBubble({
    entry,
    streamingRole,
    streamingContent,
    isStreaming,
}: MessageBubbleProps) {
    // Determine role and content based on whether it's historical or streaming
    const role = isStreaming ? streamingRole : entry?.role;
    const content = isStreaming ? streamingContent : entry?.content;
    const agentName = entry?.agent_name || (role === 'proposer' ? '正方 (Proposer)' : '反方 (Opposer)');
    const citations = entry?.citations || [];

    if (!role || (!content && !isStreaming)) return null;

    const isProposer = role === 'proposer';
    const colorVar = isProposer ? 'var(--color-proposer)' : 'var(--color-opposer)';
    const glowClass = isProposer ? 'glow-indigo' : 'glow-rose';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '24px',
                // Proposer on left, Opposer slightly indented or just keep both left for reading
                marginLeft: isProposer ? '0' : '32px',
                marginRight: isProposer ? '32px' : '0',
            }}
        >
            {/* Avatar */}
            <div
                className={`glass ${isStreaming ? glowClass : ''}`}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    flexShrink: 0,
                    border: `1px solid ${colorVar}40`, // 25% opacity
                    background: `${colorVar}10`,
                }}
            >
                {isProposer ? '🔵' : '🔴'}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1 }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px'
                }}>
                    <span style={{ fontWeight: 600, color: colorVar, fontSize: '14px' }}>
                        {agentName}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {entry?.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '正在输入...'}
                    </span>
                </div>

                <div
                    className="glass"
                    style={{
                        padding: '16px',
                        borderRadius: '0 var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        fontSize: '15px',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap', // Respect markdown newlines for now
                    }}
                >
                    {content}
                    {isStreaming && (
                        <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ repeat: Infinity, duration: 0.8 }}
                            style={{ display: 'inline-block', marginLeft: '4px', color: colorVar }}
                        >
                            ▍
                        </motion.span>
                    )}
                </div>

                {/* Citations */}
                {!isStreaming && citations.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {citations.map((url, i) => {
                            try {
                                const domain = new URL(url).hostname;
                                return (
                                    <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            fontSize: '12px',
                                            padding: '4px 10px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid var(--border-subtle)',
                                            borderRadius: 'var(--radius-sm)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}
                                    >
                                        <span style={{ opacity: 0.6 }}>📎</span> {domain}
                                    </a>
                                );
                            } catch {
                                return null;
                            }
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
