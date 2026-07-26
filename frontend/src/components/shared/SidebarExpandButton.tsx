import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { PanelLeftOpen } from 'lucide-react';
import { PRESSABLE_ICON } from '../../config/motion';

type SidebarExpandButtonProps = {
    onClick: () => void;
    variant?: 'default' | 'sophistry';
    style?: CSSProperties;
    className?: string;
};

export default function SidebarExpandButton({
    onClick,
    variant = 'default',
    style,
    className,
}: SidebarExpandButtonProps) {
    const isSophistry = variant === 'sophistry';

    return (
        <motion.button
            className={className}
            {...PRESSABLE_ICON}
            /* A 1px lift is the one hover transform allowed on a text-free control:
               it moves the whole button rather than resampling any glyphs. */
            whileHover={{ y: -1 }}
            onClick={onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 12px',
                background: isSophistry ? 'var(--mode-sophistry-card)' : 'var(--bg-card)',
                color: isSophistry ? 'var(--mode-sophistry-accent)' : 'var(--text-secondary)',
                border: isSophistry
                    ? '1px solid var(--mode-sophistry-border)'
                    : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                flexShrink: 0,
                ...style,
            }}
            title="展开历史栏"
        >
            <PanelLeftOpen size={16} />
        </motion.button>
    );
}
