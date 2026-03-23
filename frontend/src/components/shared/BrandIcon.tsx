import type { CSSProperties } from 'react';

interface BrandIconProps {
    size?: number;
    alt?: string;
    withBadge?: boolean;
    style?: CSSProperties;
    imageStyle?: CSSProperties;
}

const BADGE_BACKGROUND = 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%)';
const BADGE_SHADOW = '0 4px 20px rgba(99, 102, 241, 0.3)';

export default function BrandIcon({
    size = 40,
    alt = 'Elenchus logo',
    withBadge = true,
    style,
    imageStyle,
}: BrandIconProps) {
    if (!withBadge) {
        return (
            <img
                src="/brand/elenchus.svg"
                alt={alt}
                width={size}
                height={size}
                draggable={false}
                style={{
                    width: size,
                    height: size,
                    display: 'block',
                    objectFit: 'cover',
                    ...imageStyle,
                    ...style,
                }}
            />
        );
    }

    return (
        <div
            style={{
                width: size,
                height: size,
                padding: Math.max(3, Math.round(size * 0.08)),
                borderRadius: 'var(--radius-lg)',
                background: BADGE_BACKGROUND,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: BADGE_SHADOW,
                ...style,
            }}
        >
            <img
                src="/brand/elenchus.svg"
                alt={alt}
                width={size}
                height={size}
                draggable={false}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'cover',
                    borderRadius: 'calc(var(--radius-lg) - 4px)',
                    ...imageStyle,
                }}
            />
        </div>
    );
}
