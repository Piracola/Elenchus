import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DialogueEntry } from '../../types';

interface MessageRowProps {
    agentEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    judgeEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    systemEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
}

export default function MessageRow({ agentEntry, judgeEntry, systemEntry }: MessageRowProps) {
    if (systemEntry) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <div style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {systemEntry.content}
                </div>
            </div>
        );
    }

    if (!agentEntry && !judgeEntry) return null;

    const isProposer = agentEntry?.role === 'proposer';
    const agentColor = isProposer ? 'var(--color-proposer)' : 'var(--color-opposer)';
    const agentAvatar = isProposer ? '正' : '反';
    const alignRight = !isProposer; // Opposer aligns right if needed, but design implies both agent cards span 100% of their 60% container

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '24px',
                marginBottom: '32px',
                width: '100%',
            }}
        >
            {/* Left Column: 60% Agent Message */}
            <div style={{ flex: '6 1 0', display: 'flex', flexDirection: 'column' }}>
                {agentEntry && (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                        borderTop: `4px solid ${agentColor}`
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '16px',
                            justifyContent: alignRight ? 'flex-end' : 'flex-start'
                        }}>
                            {alignRight && (
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '14px', color: agentColor, textAlign: 'right' }}>
                                        {agentEntry.agent_name || (isProposer ? '正方' : '反方')}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                                        {agentEntry.timestamp ? new Date(agentEntry.timestamp).toLocaleTimeString() : '正在输入...'}
                                    </div>
                                </div>
                            )}

                            <div style={{
                                width: '36px', height: '36px',
                                borderRadius: 'var(--radius-sm)',
                                background: agentColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '16px'
                            }}>
                                {agentAvatar}
                            </div>

                            {!alignRight && (
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '14px', color: agentColor }}>
                                        {agentEntry.agent_name || (isProposer ? '正方' : '反方')}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {agentEntry.timestamp ? new Date(agentEntry.timestamp).toLocaleTimeString() : '正在输入...'}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="markdown-body" style={{
                            color: 'var(--text-primary)',
                            fontSize: '15px',
                            lineHeight: 1.6,
                            textAlign: alignRight ? 'right' : 'left'
                        }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {agentEntry.isStreaming ? agentEntry.streamingContent || '' : agentEntry.content || ''}
                            </ReactMarkdown>
                            {agentEntry.isStreaming && (
                                <motion.span
                                    animate={{ opacity: [1, 0, 1] }}
                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                    style={{ display: 'inline-block', marginLeft: '4px', color: agentColor }}
                                >
                                    ▍
                                </motion.span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column: 40% Judge Message */}
            <div style={{ flex: '4 1 0', display: 'flex', flexDirection: 'column' }}>
                {judgeEntry && (
                    <div style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px',
                        borderTop: `4px solid var(--color-judge)`
                    }}>
                        {/* Judge Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '16px',
                        }}>
                            <div style={{
                                width: '32px', height: '32px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--color-judge)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '14px'
                            }}>
                                裁
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-judge)' }}>裁判员评价</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {judgeEntry.timestamp ? new Date(judgeEntry.timestamp).toLocaleTimeString() : '正在裁判...'}
                                </div>
                            </div>
                        </div>

                        {/* Judge Content */}
                        <div className="markdown-body" style={{
                            color: 'var(--text-secondary)',
                            fontSize: '14px',
                            lineHeight: 1.6,
                        }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {judgeEntry.isStreaming ? judgeEntry.streamingContent || '' : judgeEntry.content || ''}
                            </ReactMarkdown>
                            {judgeEntry.isStreaming && (
                                <motion.span
                                    animate={{ opacity: [1, 0, 1] }}
                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                    style={{ display: 'inline-block', marginLeft: '4px', color: 'var(--color-judge)' }}
                                >
                                    ▍
                                </motion.span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
