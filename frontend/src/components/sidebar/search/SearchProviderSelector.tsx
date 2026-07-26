import type { SearchProviderDescriptor, SearchProviderType } from '../../../types';
import { SettingsBadge } from '../settings/SettingsPrimitives';

type SearchProviderSelectorProps = {
    providers: SearchProviderDescriptor[];
    currentProvider: SearchProviderType;
    activeAction: string | null;
    isBusy: boolean;
    onProviderChange: (providerName: SearchProviderType) => void;
};

/** Renders one card per provider the backend registry reports. */
export function SearchProviderSelector({
    providers,
    currentProvider,
    activeAction,
    isBusy,
    onProviderChange,
}: SearchProviderSelectorProps) {
    return (
        <div className="settings-radio-list">
            {providers.map((provider) => {
                const isSelected = currentProvider === provider.name;
                const isSwitching = activeAction === `provider:${provider.name}`;
                const canSelect = provider.available && !isBusy;

                return (
                    <button
                        key={provider.name}
                        type="button"
                        className={`settings-radio-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => {
                            if (canSelect) {
                                onProviderChange(provider.name);
                            }
                        }}
                        disabled={!provider.available || isBusy}
                        aria-pressed={isSelected}
                    >
                        <span className="settings-radio-dot" aria-hidden="true" />
                        <span style={{ minWidth: 0 }}>
                            <span className="settings-control-row" style={{ gap: '8px' }}>
                                <span className="settings-radio-title">{provider.label}</span>
                                {!provider.configured && (
                                    <SettingsBadge tone="muted">未配置</SettingsBadge>
                                )}
                                {provider.configured && !provider.available && (
                                    <SettingsBadge tone="muted">不可用</SettingsBadge>
                                )}
                                {isSwitching && <SettingsBadge tone="accent">切换中</SettingsBadge>}
                            </span>
                            <span className="settings-radio-description">{provider.description}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
