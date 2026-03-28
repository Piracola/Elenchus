import { motion } from 'framer-motion';

type HomeStatusLegendProps = {
    isSophistryMode: boolean;
};

export function HomeStatusLegend({ isSophistryMode }: HomeStatusLegendProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{
                display: 'flex',
                gap: '24px',
                marginTop: '36px',
                color: 'var(--text-muted)',
                fontSize: '12px',
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
