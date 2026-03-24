import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { PanelLeftOpen } from 'lucide-react';

type SidebarExpandButtonProps = {
    onClick: () => void;
    variant?: 'default' | 'sophistry';
    style?: CSSProperties;
};

export default function SidebarExpandButton({
    onClick,
    variant = 'default',
    style,
}: SidebarExpandButtonProps) {
    const isSophistry = variant === 'sophistry';

    return (
        <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
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
