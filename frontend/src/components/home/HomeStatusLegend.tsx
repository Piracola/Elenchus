import { motion } from 'framer-motion';

type HomeStatusLegendProps = {
    isSophistryMode: boolean;
    compact?: boolean;
};

export function HomeStatusLegend({ isSophistryMode, compact = false }: HomeStatusLegendProps) {
    return (
        <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{
                display: 'flex',
                gap: compact ? '12px' : '24px',
                marginTop: compact ? 0 : '36px',
                color: 'var(--text-muted)',
                fontSize: '12px',
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: compact ? 'flex-end' : 'center',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--color-proposer)',
                    }}
                />
                <span>正方观点</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--color-opposer)',
                    }}
                />
                <span>反方观点</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: isSophistryMode ? 'var(--mode-sophistry-accent)' : 'var(--color-judge)',
                    }}
                />
                <span>{isSophistryMode ? '观察报告' : '裁判评分'}</span>
            </div>
        </motion.div>
    );
}
