type HomeStatusLegendProps = {
    isSophistryMode: boolean;
    compact?: boolean;
};

/**
 * Static legend. It used to be a `motion.div` with `initial={false}` animating to
 * `opacity: 1` after a 500ms delay — a motion component whose animation could
 * never run. The home entrance is owned by one wrapper in HomeView; the legend
 * simply rides along with it.
 */
export function HomeStatusLegend({ isSophistryMode, compact = false }: HomeStatusLegendProps) {
    return (
        <div
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
        </div>
    );
}
