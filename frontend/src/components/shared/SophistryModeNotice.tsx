import { AlertTriangle } from 'lucide-react';
import { SOPHISTRY_MODE_TAGS, SOPHISTRY_MODE_WARNING } from '../../constants/sophistry';

type SophistryModeNoticeProps = {
    artifactCount?: number;
    compact?: boolean;
    fontSize?: string;
};

export default function SophistryModeNotice({
    artifactCount = 0,
    compact = false,
    fontSize = '12px',
}: SophistryModeNoticeProps) {
    if (compact) {
        return (
            <div
                style={{
                    width: '100%',
                    display: 'flex',
                    gap: '12px',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-xl)',
                    background: 'var(--mode-sophistry-card)',
                    border: '1px solid var(--mode-sophistry-border)',
                    boxShadow: 'var(--shadow-sm)',
                    color: 'var(--text-secondary)',
                }}
            >
                <AlertTriangle
                    size={18}
                    style={{ color: 'var(--mode-sophistry-accent)', flexShrink: 0, marginTop: '1px' }}
                />
                <div style={{ fontSize, lineHeight: 1.65 }}>
                    {SOPHISTRY_MODE_WARNING}
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                pointerEvents: 'auto',
                padding: '12px 14px',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--mode-sophistry-card)',
                border: '1px solid var(--mode-sophistry-border)',
                boxShadow: '0 6px 18px rgba(184, 137, 70, 0.08)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '8px',
                }}
            >
                <span
                    style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--mode-sophistry-accent)',
                    }}
                >
                    模式提示
                </span>
                <span
                    style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(184, 137, 70, 0.10)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    观察报告 {artifactCount} 条
                </span>
            </div>
            <div
                style={{
                    fontSize,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                }}
            >
                {SOPHISTRY_MODE_WARNING}
            </div>
            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginTop: '8px',
                }}
            >
                {SOPHISTRY_MODE_TAGS.map((label) => (
                    <span
                        key={label}
                        style={{
                            padding: '4px 10px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(184, 137, 70, 0.10)',
                            color: 'var(--mode-sophistry-accent)',
                            fontSize: '12px',
                            fontWeight: 600,
                        }}
                    >
                        {label}
                    </span>
                ))}
            </div>
        </div>
    );
}
