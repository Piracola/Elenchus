/**
 * StatusBanner — displays current debate phase (fact-checking, judging, etc.)
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
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                    padding: '12px 24px',
                    background: 'rgba(34, 211, 238, 0.05)',
                    borderBottom: '1px solid rgba(34, 211, 238, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: 'var(--accent-cyan)',
                    fontSize: '13px',
                    fontWeight: 500,
                }}
            >
                <motion.span
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                >
                    <span style={{ 
                        display: 'inline-block',
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: 'currentColor' 
                    }} />
                </motion.span>
                <span>{currentStatus}</span>
            </motion.div>
        </AnimatePresence>
    );
}
