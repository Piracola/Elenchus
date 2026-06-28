import type { ChangeEventHandler } from 'react';
import { KeyRound, Save, Trash2 } from 'lucide-react';

import {
    SettingsButton,
    SettingsField,
    SettingsInput,
    SettingsNotice,
    SettingsSection,
} from '../settings/SettingsPrimitives';

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
    const shouldShowSaveButton = saveIdleLabel.trim().length > 0;

    return (
        <SettingsSection
            title={title}
            description={description}
            icon={<KeyRound size={15} />}
        >
            {fields.length === 0 ? (
                <SettingsNotice>
                    该搜索引擎无需单独配置即可使用。
                </SettingsNotice>
            ) : (
                <div className="settings-form-grid">
                    {fields.map((field) => (
                        <SettingsField key={field.label} label={field.label} hint={field.helperText}>
                            <SettingsInput
                                type={field.type ?? 'text'}
                                autoComplete={field.autoComplete}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder={field.placeholder}
                            />
                        </SettingsField>
                    ))}
                </div>
            )}

            {(shouldShowSaveButton || showClearButton) && (
                <div className="settings-inline-controls">
                    {shouldShowSaveButton && (
                        <SettingsButton
                            variant="primary"
                            onClick={onSave}
                            disabled={isBusy}
                            icon={<Save size={15} />}
                        >
                            {activeAction === saveActionId ? saveBusyLabel : saveIdleLabel}
                        </SettingsButton>
                    )}

                    {showClearButton && onClear && clearActionId && clearIdleLabel && clearBusyLabel && (
                        <SettingsButton
                            variant="danger"
                            onClick={onClear}
                            disabled={isBusy}
                            icon={<Trash2 size={15} />}
                        >
                            {activeAction === clearActionId ? clearBusyLabel : clearIdleLabel}
                        </SettingsButton>
                    )}
                </div>
            )}
        </SettingsSection>
    );
}
