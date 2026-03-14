/**
 * StatusBanner — compact single-line status indicator for debate phases.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';

export default function StatusBanner() {
    const { isDebating, phase, currentStatus } = useDebateStore();

    if (!isDebating || phase === 'idle' || phase === 'complete') {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                style={{
                    padding: '10px 16px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-xl)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.6, 1],
                    }}
                    transition={{
                        repeat: Infinity,
                        duration: 1.5,
                        ease: "easeInOut"
                    }}
                    style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: 'var(--accent-cyan)',
                        flexShrink: 0,
                    }}
                />
                <span style={{
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {currentStatus}
                </span>
                <div style={{
                    flex: 1,
                    height: '2px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden',
                    minWidth: '60px',
                }}>
                    <motion.div
                        animate={{
                            x: ['-100%', '100%'],
                        }}
                        transition={{
                            repeat: Infinity,
                            duration: 1.5,
                            ease: "linear"
                        }}
                        style={{
                            width: '30%',
                            height: '100%',
                            background: 'var(--accent-cyan)',
                            borderRadius: 'var(--radius-full)',
                            opacity: 0.6,
                        }}
                    />
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
