import { motion } from 'framer-motion';

export default function Header() {
    return (
        <motion.header
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="glass"
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                borderBottom: '1px solid var(--border-subtle)',
            }}
        >
            {/* Logo & Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '16px',
                        color: '#fff',
                    }}
                >
                    E
                </div>
                <div>
                    <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Elenchus
                    </h1>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-2px' }}>
                        Multi-Agent Debate Arena
                    </p>
                </div>
            </div>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-emerald)',
                        boxShadow: '0 0 8px var(--accent-emerald)',
                    }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ready</span>
            </div>
        </motion.header>
    );
}
