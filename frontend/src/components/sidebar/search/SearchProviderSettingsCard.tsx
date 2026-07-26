import { KeyRound, Save, Trash2 } from 'lucide-react';

import type { SearchProviderDescriptor } from '../../../types';
import {
    SettingsBadge,
    SettingsButton,
    SettingsField,
    SettingsInput,
    SettingsNotice,
    SettingsSection,
} from '../settings/SettingsPrimitives';

type SearchProviderSettingsCardProps = {
    provider: SearchProviderDescriptor;
    /** Draft values for this provider, keyed by field key. */
    draft: Record<string, string>;
    onFieldChange: (fieldKey: string, value: string) => void;
    onSave: () => void;
    onClearSecret: (fieldKey: string) => void;
    isBusy: boolean;
    activeAction: string | null;
};

/**
 * Renders a provider's settings purely from its backend-declared fields, so a
 * newly registered provider gets a working form with no frontend change.
 */
export function SearchProviderSettingsCard({
    provider,
    draft,
    onFieldChange,
    onSave,
    onClearSecret,
    isBusy,
    activeAction,
}: SearchProviderSettingsCardProps) {
    const hasFields = provider.fields.length > 0;
    const savedSecrets = provider.fields.filter((field) => field.secret && field.configured);
    const isSaving = activeAction === `save:${provider.name}`;

    return (
        <SettingsSection
            title={provider.label}
            description={provider.description}
            icon={<KeyRound size={15} />}
        >
            {!hasFields ? (
                <SettingsNotice>该搜索引擎无需单独配置即可使用。</SettingsNotice>
            ) : (
                <>
                    <div className="settings-form-grid">
                        {provider.fields.map((field) => {
                            const hint = field.secret && field.configured
                                ? `已保存密钥，留空则保持不变。${field.helper_text}`
                                : field.helper_text;
                            return (
                                <SettingsField key={field.key} label={field.label} hint={hint}>
                                    <SettingsInput
                                        type={field.type}
                                        autoComplete={field.secret ? 'off' : undefined}
                                        value={draft[field.key] ?? ''}
                                        onChange={(event) => onFieldChange(field.key, event.target.value)}
                                        placeholder={
                                            field.secret && field.configured
                                                ? '留空则保持已保存的密钥'
                                                : field.placeholder
                                        }
                                    />
                                </SettingsField>
                            );
                        })}
                    </div>

                    <div className="settings-inline-controls">
                        <SettingsButton
                            variant="primary"
                            onClick={onSave}
                            disabled={isBusy}
                            icon={<Save size={15} />}
                        >
                            {isSaving ? '保存中...' : `保存 ${provider.label} 配置`}
                        </SettingsButton>

                        {savedSecrets.map((field) => (
                            <SettingsButton
                                key={field.key}
                                variant="danger"
                                onClick={() => onClearSecret(field.key)}
                                disabled={isBusy}
                                icon={<Trash2 size={15} />}
                            >
                                {activeAction === `clear:${provider.name}:${field.key}`
                                    ? '清除中...'
                                    : `清除已保存的${field.label}`}
                            </SettingsButton>
                        ))}

                        {provider.configured && (
                            <SettingsBadge tone={provider.available ? 'accent' : 'muted'}>
                                {provider.available ? '就绪' : '不可用'}
                            </SettingsBadge>
                        )}
                    </div>
                </>
            )}
        </SettingsSection>
    );
}
