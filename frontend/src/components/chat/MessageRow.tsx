import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SCORE_DIMENSIONS } from '../../types';
import type { DialogueEntry } from '../../types';

interface MessageRowProps {
    agentEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    judgeEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
    systemEntry?: (DialogueEntry & { isStreaming?: boolean; streamingContent?: string }) | null;
}

export default function MessageRow({ agentEntry, judgeEntry, systemEntry }: MessageRowProps) {
    if (systemEntry) {
        if (systemEntry.role === 'audience') {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        style={{
                            padding: '12px 24px',
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-xl)',
                            maxWidth: '70%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            boxShadow: 'var(--shadow-md), 0 2px 8px rgba(52, 199, 89, 0.15)',
                        }}
                    >
                        <span style={{
                            fontSize: '12px',
                            color: 'var(--color-proposer)',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            padding: '4px 10px',
                            background: 'rgba(52, 199, 89, 0.12)',
                            borderRadius: 'var(--radius-full)',
                        }}>
                            观众介入
                        </span>
                        <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                            {systemEntry.content}
                        </span>
                    </motion.div>
                </div>
            );
        }
        return (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        padding: '10px 20px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        boxShadow: 'var(--shadow-xs)',
                    }}
                >
                    {systemEntry.content}
                </motion.div>
            </div>
        );
    }

    if (!agentEntry && !judgeEntry) return null;

    const isProposer = agentEntry?.role === 'proposer';
    const agentColor = isProposer ? 'var(--color-proposer)' : 'var(--color-opposer)';

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            gap: '20px',
            marginBottom: '32px',
            opacity: (!agentEntry && judgeEntry) ? 0.8 : 1
        }}>
            {/* ========== Left Column: Debater (Flex 6) ========== */}
            <div style={{ flex: '6 1 0', display: 'flex', flexDirection: 'column' }}>
                {agentEntry && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        style={{
                            position: 'relative',
                            background: 'var(--bg-card)',
                            padding: '28px',
                            borderRadius: 'var(--radius-xl)',
                            boxShadow: `var(--shadow-sm), 0 4px 20px ${isProposer ? 'rgba(52, 199, 89, 0.08)' : 'rgba(255, 59, 48, 0.08)'}`,
                            marginTop: '20px',
                            transition: 'box-shadow var(--transition-fast)',
                        }}
                    >
                        {/* Floating Avatar Badge */}
                        <div style={{
                            position: 'absolute',
                            top: '-16px',
                            left: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}>
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    background: agentColor,
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '16px',
                                    boxShadow: `0 6px 16px ${isProposer ? 'rgba(52, 199, 89, 0.35)' : 'rgba(255, 59, 48, 0.35)'}`,
                                }}
                            >
                                {isProposer ? '正' : '反'}
                            </motion.div>
                            <span style={{
                                fontSize: '13px',
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-card)',
                                padding: '6px 14px',
                                borderRadius: 'var(--radius-full)',
                                boxShadow: 'var(--shadow-xs)',
                                fontWeight: 500,
                            }}>
                                {agentEntry.agent_name || (isProposer ? '正方' : '反方')}
                            </span>
                        </div>

                        {/* Speech Content */}
                        <div className="markdown-body" style={{
                            color: 'var(--text-primary)',
                            fontSize: '15px',
                            lineHeight: 1.7,
                            marginTop: '16px'
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
                    </motion.div>
                )}
            </div>

            {/* ========== Right Column: Judge (Flex 4) ========== */}
            <div style={{ flex: '4 1 0', display: 'flex', flexDirection: 'column' }}>
                {judgeEntry && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        style={{
                            position: 'relative',
                            background: 'var(--bg-secondary)',
                            padding: '24px',
                            borderRadius: 'var(--radius-xl)',
                            boxShadow: 'var(--shadow-sm), 0 4px 20px rgba(255, 149, 0, 0.08)',
                            marginTop: '20px',
                            border: '1px solid rgba(255, 149, 0, 0.1)',
                        }}
                    >
                        {/* Judge Floating Badge */}
                        <div style={{
                            position: 'absolute',
                            top: '-16px',
                            left: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}>
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    background: 'var(--color-judge)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    boxShadow: '0 6px 16px rgba(255, 149, 0, 0.35)',
                                }}
                            >
                                裁
                            </motion.div>
                            <span style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-card)',
                                padding: '5px 12px',
                                borderRadius: 'var(--radius-full)',
                                boxShadow: 'var(--shadow-xs)',
                                fontWeight: 500,
                            }}>
                                裁判组视角
                            </span>
                        </div>

                        {/* Judge Content */}
                        <div className="markdown-body" style={{
                            color: 'var(--text-secondary)',
                            fontSize: '14px',
                            lineHeight: 1.7,
                            marginTop: '12px'
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

                        {/* Quantitative Scores Breakdown */}
                        {judgeEntry.scores && Object.keys(judgeEntry.scores).length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                style={{
                                    marginTop: '20px',
                                    padding: '20px',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-lg)',
                                    boxShadow: 'var(--shadow-inner)',
                                }}
                            >
                                <div style={{
                                    fontSize: '12px',
                                    color: 'var(--text-muted)',
                                    marginBottom: '12px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}>多维度量化评分</div>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                                    gap: '10px'
                                }}>
                                    {SCORE_DIMENSIONS.map(dim => {
                                        const dimData = (judgeEntry!.scores as any)[dim.key];
                                        if (!dimData) return null;
                                        return (
                                            <motion.div
                                                key={dim.key}
                                                whileHover={{ scale: 1.02 }}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    background: 'var(--bg-card)',
                                                    padding: '12px',
                                                    borderRadius: 'var(--radius-md)',
                                                    boxShadow: 'var(--shadow-xs)',
                                                    transition: 'box-shadow var(--transition-fast)',
                                                }}
                                            >
                                                <div style={{
                                                    fontSize: '12px',
                                                    color: 'var(--text-secondary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <span>{dim.icon}</span> {dim.label}
                                                </div>
                                                <div style={{
                                                    fontSize: '20px',
                                                    fontWeight: 700,
                                                    color: 'var(--color-judge)',
                                                    marginTop: '6px'
                                                }}>
                                                    {dimData.score}<span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
