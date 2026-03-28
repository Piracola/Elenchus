import { motion } from 'framer-motion';
import type { DebateMode } from '../../types';
import { HOME_MODE_OPTIONS, type HomeFontSizes } from './shared';

type HomeModeSelectorProps = {
    debateMode: DebateMode;
    homeFontSizes: HomeFontSizes;
    onModeChange: (mode: DebateMode) => void;
};

export function HomeModeSelector({
    debateMode,
    homeFontSizes,
    onModeChange,
}: HomeModeSelectorProps) {
    return (
        <div
            style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '12px',
                marginBottom: '16px',
            }}
        >
            {HOME_MODE_OPTIONS.map((item) => {
                const active = debateMode === item.mode;
                return (
                    <motion.button
                        key={item.mode}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onModeChange(item.mode)}
                        style={{
                            textAlign: 'left',
                            padding: '16px 18px',
                            borderRadius: 'var(--radius-xl)',
                            border: active
                                ? `1px solid ${item.mode === 'sophistry_experiment' ? 'var(--mode-sophistry-accent)' : 'var(--accent-indigo)'}`
                                : '1px solid var(--border-subtle)',
                            background: active && item.mode === 'sophistry_experiment'
                                ? 'var(--mode-sophistry-card)'
                                : 'var(--bg-card)',
                            boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-xs)',
                            cursor: 'pointer',
                        }}
                    >
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '8px',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: active
                                        ? (item.mode === 'sophistry_experiment'
                                            ? 'var(--mode-sophistry-accent)'
                                            : 'var(--accent-indigo)')
                                        : 'var(--text-primary)',
                                }}
                            >
                                {item.title}
                            </span>
                            {active && (
                                <span
                                    style={{
                                        padding: '2px 8px',
                                        borderRadius: 'var(--radius-full)',
                                        background: item.mode === 'sophistry_experiment'
                                            ? 'rgba(184, 137, 70, 0.12)'
                                            : 'rgba(99, 102, 241, 0.12)',
                                        color: item.mode === 'sophistry_experiment'
                                            ? 'var(--mode-sophistry-accent)'
                                            : 'var(--accent-indigo)',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                    }}
                                >
                                    当前
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                fontSize: homeFontSizes.modeDescription,
                                lineHeight: 1.6,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {item.description}
                        </div>
                    </motion.button>
                );
            })}
        </div>
    );
}
