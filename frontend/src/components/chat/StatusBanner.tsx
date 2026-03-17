/**
 * StatusBanner — compact single-line status indicator for debate phases.
 */

import { motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';

export default function StatusBanner() {
    const { isDebating, phase, currentStatus } = useDebateStore();

    if (!isDebating || phase === 'idle' || phase === 'complete') {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            style={{
                padding: '10px 14px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                backdropFilter: 'blur(12px)',
                flexShrink: 0,
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
                fontSize: '11px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
            }}>
                {currentStatus}
            </span>
        </motion.div>
    );
}
