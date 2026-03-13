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
        return (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
                <div style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {systemEntry.content}
                </div>
            </div>
        );
    }

    if (!agentEntry && !judgeEntry) return null;

    const isProposer = agentEntry?.role === 'proposer';
    const agentColor = isProposer ? 'var(--color-proposer)' : 'var(--color-opposer)';
    // Default background for Debater is standard card color but with border
    // Alternatively, we tint the background very slightly
    const debaterBg = 'var(--bg-secondary)'; // or 'var(--bg-card)'
    const judgeBg = 'var(--bg-primary)';

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'row', 
            width: '100%', 
            gap: '24px',        
            marginBottom: '40px',   // Plenty of space for the floating labels
            opacity: (!agentEntry && judgeEntry) ? 0.8 : 1 // Slight fade if only judge speaks unexpectedly
        }}>
            {/* ========== Left Column: Debater (Flex 6) ========== */}
            <div style={{ flex: '6 1 0', display: 'flex', flexDirection: 'column' }}>
                {agentEntry && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ 
                            position: 'relative', 
                            background: debaterBg, 
                            border: '1px solid var(--border-subtle)',
                            padding: '24px', 
                            borderRadius: '12px',
                            // Give space for the floating avatar at the top left
                            marginTop: '16px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
                        }}
                    >
                        {/* Absolute Top-Left Floating Label */}
                        <div style={{
                            position: 'absolute',
                            top: '-16px',
                            left: '16px', 
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{
                                width: '32px', height: '32px',
                                background: agentColor,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '14px',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                            }}>
                                {isProposer ? '正' : '反'}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                {agentEntry.agent_name || (isProposer ? '正方' : '反方')}
                            </span>
                        </div>

                        {/* Speech Content */}
                        <div className="markdown-body" style={{
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            lineHeight: 1.6,
                            marginTop: '8px' // Slightly push down below real boundary to clear the badge visually
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
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ 
                            position: 'relative',
                            background: judgeBg, 
                            padding: '24px', 
                            borderRadius: '12px',
                            border: '1px solid var(--border-subtle)',
                            marginTop: '16px',
                        }}
                    >
                        {/* Judge Floating Label */}
                        <div style={{
                            position: 'absolute',
                            top: '-16px',
                            left: '16px', 
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{
                                width: '32px', height: '32px',
                                background: 'var(--color-judge)',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '14px',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                            }}>
                                裁
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                裁判组视角
                            </span>
                        </div>

                        {/* Judge Content */}
                        <div className="markdown-body" style={{
                            color: 'var(--text-secondary)',
                            fontSize: '13px',
                            lineHeight: 1.6,
                            marginTop: '8px'
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
                            <div style={{
                                marginTop: '16px',
                                paddingTop: '16px',
                                borderTop: '1px solid var(--border-subtle)'
                            }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>多维度量化评分</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                                    {SCORE_DIMENSIONS.map(dim => {
                                        const dimData = (judgeEntry!.scores as any)[dim.key];
                                        if (!dimData) return null;
                                        return (
                                            <div key={dim.key} style={{ 
                                                display: 'flex', 
                                                flexDirection: 'column', 
                                                background: 'var(--bg-secondary)', 
                                                padding: '8px', 
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-subtle)'
                                            }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>{dim.icon}</span> {dim.label}
                                                </div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-judge)', marginTop: '4px' }}>
                                                    {dimData.score}<span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
