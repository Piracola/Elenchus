export const buttonStyles = {
    primary: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '11px 14px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: 'var(--shadow-xs)',
        transition: 'all var(--transition-fast)',
    },
    icon: {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '9px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
    },
    control: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
        padding: '8px 14px',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: 'var(--shadow-xs)',
    },
};

export const inputStyles = {
    text: {
        width: '100%',
        padding: '10px 12px',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: 'var(--text-primary)',
        fontSize: '13px',
        borderRadius: 'var(--radius-lg)',
    },
    textarea: {
        width: '100%',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: 'var(--text-primary)',
        fontSize: '16px',
        resize: 'none' as const,
        lineHeight: 1.6,
        fontWeight: 500,
    },
    number: {
        width: '36px',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: 'var(--text-primary)',
        fontSize: '13px',
        fontWeight: 500,
        textAlign: 'center' as const,
        MozAppearance: 'textfield' as const,
        WebkitAppearance: 'none' as const,
    },
};

export const cardStyles = {
    base: {
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border-subtle)',
    },
    elevated: {
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backdropFilter: 'blur(12px)',
    },
};

export const layoutStyles = {
    flexColumn: {
        display: 'flex',
        flexDirection: 'column' as const,
    },
    flexRow: {
        display: 'flex',
        flexDirection: 'row' as const,
    },
    centered: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
};

export const typographyStyles = {
    heading: {
        fontSize: '17px',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: 'var(--text-primary)',
        margin: 0,
    },
    subheading: {
        fontSize: '15px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
    },
    label: {
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        margin: 0,
    },
    body: {
        fontSize: '13px',
        color: 'var(--text-secondary)',
    },
    muted: {
        fontSize: '11px',
        color: 'var(--text-muted)',
    },
};

export const statusBadgeStyles = {
    base: {
        padding: '2px 6px',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 500,
        fontSize: '10px',
    },
    active: {
        background: 'rgba(52, 199, 89, 0.1)',
        color: 'var(--color-proposer)',
    },
    inactive: {
        background: 'var(--bg-tertiary)',
        color: 'var(--text-muted)',
    },
};
