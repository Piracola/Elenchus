import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type SettingsPageProps = {
    title: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
};

export function SettingsPage({ title, description, action, children }: SettingsPageProps) {
    return (
        <div className="settings-page">
            <div className="settings-page-header">
                <div className="settings-page-heading">
                    <h3 className="settings-page-title">{title}</h3>
                    {description && <p className="settings-page-description">{description}</p>}
                </div>
                {action}
            </div>
            <div className="settings-page-content">
                {children}
            </div>
        </div>
    );
}

type SettingsSectionProps = {
    title: string;
    description?: string;
    icon?: ReactNode;
    children: ReactNode;
};

export function SettingsSection({ title, description, icon, children }: SettingsSectionProps) {
    return (
        <section className="settings-section">
            <div className="settings-section-heading">
                <div className="settings-section-title-row">
                    {icon && <span className="settings-section-icon">{icon}</span>}
                    <h4 className="settings-section-title">{title}</h4>
                </div>
                {description && <p className="settings-section-description">{description}</p>}
            </div>
            <div className="settings-section-body">
                {children}
            </div>
        </section>
    );
}

type SettingsFieldProps = {
    label?: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    children: ReactNode;
};

export function SettingsField({ label, htmlFor, hint, children }: SettingsFieldProps) {
    return (
        <div className="settings-field">
            {label && (
                <label className="settings-field-label" htmlFor={htmlFor}>
                    {label}
                </label>
            )}
            {children}
            {hint && <div className="settings-field-hint">{hint}</div>}
        </div>
    );
}

type SettingsInputProps = InputHTMLAttributes<HTMLInputElement>;

export function SettingsInput(props: SettingsInputProps) {
    return <input {...props} className={`settings-input ${props.className ?? ''}`.trim()} />;
}

type SettingsTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function SettingsTextarea(props: SettingsTextareaProps) {
    return <textarea {...props} className={`settings-input ${props.className ?? ''}`.trim()} />;
}

type SettingsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    icon?: ReactNode;
};

export function SettingsButton({
    variant = 'secondary',
    size = 'md',
    icon,
    children,
    className,
    type = 'button',
    ...props
}: SettingsButtonProps) {
    const variantClass = variant === 'secondary' ? '' : `settings-button--${variant}`;
    const sizeClass = size === 'md' ? '' : `settings-button--${size}`;
    const classes = ['settings-button', variantClass, sizeClass, className].filter(Boolean).join(' ');

    return (
        <button {...props} type={type} className={classes}>
            {icon}
            {children && <span className="settings-button-text">{children}</span>}
        </button>
    );
}

type SettingsNoticeProps = {
    children: ReactNode;
    icon?: ReactNode;
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
};

export function SettingsNotice({ children, icon, tone = 'neutral' }: SettingsNoticeProps) {
    const toneClass = tone === 'neutral' ? '' : `settings-notice--${tone}`;
    return (
        <div className={`settings-notice ${toneClass}`.trim()}>
            {icon}
            <div>{children}</div>
        </div>
    );
}

type SettingsBadgeProps = {
    children: ReactNode;
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'muted';
};

export function SettingsBadge({ children, tone = 'neutral' }: SettingsBadgeProps) {
    const toneClass = tone === 'neutral' ? '' : `settings-badge--${tone}`;
    return <span className={`settings-badge ${toneClass}`.trim()}>{children}</span>;
}

