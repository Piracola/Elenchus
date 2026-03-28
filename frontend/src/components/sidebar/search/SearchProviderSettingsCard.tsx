import type { ChangeEventHandler } from 'react';

import {
    helperTextStyle,
    inputStyle,
    labelStyle,
} from './searchConfigShared';

type SearchProviderField = {
    label: string;
    value: string;
    placeholder: string;
    helperText: string;
    onChange: ChangeEventHandler<HTMLInputElement>;
    type?: 'text' | 'password';
    autoComplete?: string;
};

type SearchProviderSettingsCardProps = {
    title: string;
    description: string;
    fields: SearchProviderField[];
    onSave: () => void;
    isBusy: boolean;
    activeAction: string | null;
    saveActionId: string;
    saveIdleLabel: string;
    saveBusyLabel: string;
    showClearButton?: boolean;
    onClear?: () => void;
    clearActionId?: string;
    clearIdleLabel?: string;
    clearBusyLabel?: string;
};

export function SearchProviderSettingsCard({
    title,
    description,
    fields,
    onSave,
    isBusy,
    activeAction,
    saveActionId,
    saveIdleLabel,
    saveBusyLabel,
    showClearButton = false,
    onClear,
    clearActionId,
    clearIdleLabel,
    clearBusyLabel,
}: SearchProviderSettingsCardProps) {
    return (
        <div
            style={{
                padding: '30px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow-xs)',
            }}
        >
            <div style={{ marginBottom: '22px' }}>
                <div style={{ fontSize: '22px', color: 'var(--text-primary)', fontWeight: 700 }}>
                    {title}
                </div>
                <div style={{ ...helperTextStyle, marginTop: '8px' }}>
                    {description}
                </div>
            </div>

            <div style={{ display: 'grid', gap: '20px' }}>
                {fields.map((field) => (
                    <div key={field.label}>
                        <label style={labelStyle}>{field.label}</label>
                        <input
                            type={field.type ?? 'text'}
                            autoComplete={field.autoComplete}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={field.placeholder}
                            style={inputStyle}
                        />
                        <div style={helperTextStyle}>
                            {field.helperText}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '14px', marginTop: '24px', flexWrap: 'wrap' }}>
                <button
                    onClick={onSave}
                    disabled={isBusy}
                    style={{
                        padding: '14px 22px',
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        fontSize: '16px',
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        opacity: isBusy ? 0.7 : 1,
                    }}
                >
                    {activeAction === saveActionId ? saveBusyLabel : saveIdleLabel}
                </button>

                {showClearButton && onClear && clearActionId && clearIdleLabel && clearBusyLabel && (
                    <button
                        onClick={onClear}
                        disabled={isBusy}
                        style={{
                            padding: '14px 22px',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            fontWeight: 600,
                            fontSize: '16px',
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            opacity: isBusy ? 0.7 : 1,
                        }}
                    >
                        {activeAction === clearActionId ? clearBusyLabel : clearIdleLabel}
                    </button>
                )}
            </div>
        </div>
    );
}
