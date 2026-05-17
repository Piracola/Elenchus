import type { CSSProperties } from 'react';

export const HEADER_TOOLBAR_BUTTON_STYLE: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    minHeight: '34px',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    boxShadow: 'none',
    transition: 'background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease',
};

export const HEADER_TOOLBAR_BUTTON_ACTIVE_STYLE: CSSProperties = {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
    boxShadow: 'none',
};

export const HEADER_TOOLBAR_PANEL_STYLE: CSSProperties = {
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
};

export const HEADER_TOOLBAR_SECONDARY_BUTTON_STYLE: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease',
};

export const HEADER_TOOLBAR_PRIMARY_BUTTON_STYLE: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: 'none',
    background: 'var(--text-primary)',
    color: 'var(--bg-primary)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
    transition: 'opacity 0.16s ease',
};
