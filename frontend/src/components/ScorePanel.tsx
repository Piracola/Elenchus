import { motion } from 'framer-motion';

/**
 * ScorePanel — placeholder for the scoring sidebar.
 * Will show radar chart + cumulative trends in Step 5.
 */
export default function ScorePanel() {
    const dimensions = [
        { key: 'logical_rigor', label: '逻辑严密度', icon: '🧠' },
        { key: 'evidence_quality', label: '证据质量', icon: '📊' },
        { key: 'rebuttal_strength', label: '反驳力度', icon: '⚡' },
        { key: 'consistency', label: '前后自洽', icon: '🔗' },
        { key: 'persuasiveness', label: '说服力', icon: '🎯' },
    ];

    return (
        <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{
                width: '340px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '20px',
                overflowY: 'auto',
            }}
        >
            {/* Radar chart placeholder */}
            <div
                className="glass"
                style={{
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                }}
            >
                <h3
                    style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}
                >
                    📈 实时评分
                </h3>
                <div
                    style={{
                        height: '200px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--radius-md)',
                        border: '1px dashed var(--border-subtle)',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                    }}
                >
                    雷达图将在辩论开始后显示
                </div>
            </div>

            {/* Score dimensions list */}
            <div
                className="glass"
                style={{
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                }}
            >
                <h3
                    style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}
                >
                    评分维度
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {dimensions.map((dim) => (
                        <div
                            key={dim.key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-tertiary)',
                            }}
                        >
                            <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{dim.icon}</span>
                                <span>{dim.label}</span>
                            </span>
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: 'var(--text-muted)',
                                    fontFamily: 'monospace',
                                }}
                            >
                                —/10
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Export button */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                }}
            >
                📥 Export Data
            </motion.button>
        </motion.aside>
    );
}
