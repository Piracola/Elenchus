import type { SearchProviderStatus, SearchProviderType } from '../../../types';
import { PROVIDER_INFO } from './searchConfigShared';
import { SettingsBadge } from '../settings/SettingsPrimitives';

type SearchProviderSelectorProps = {
    providers: SearchProviderStatus[];
    currentProvider: SearchProviderType | string;
    activeAction: string | null;
    isBusy: boolean;
    onProviderChange: (providerName: SearchProviderType) => void;
};

export function SearchProviderSelector({
    providers,
    currentProvider,
    activeAction,
    isBusy,
    onProviderChange,
}: SearchProviderSelectorProps) {
    return (
        <div className="settings-radio-list">
            {(Object.keys(PROVIDER_INFO) as SearchProviderType[]).map((providerKey) => {
                const provider = providers.find((item) => item.name === providerKey);
                const info = PROVIDER_INFO[providerKey];
                const isSelected = currentProvider === providerKey;
                const isAvailable = provider?.available ?? false;
                const isSwitching = activeAction === `provider:${providerKey}`;

                return (
                    <button
                        key={providerKey}
                        type="button"
                        className={`settings-radio-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => {
                            if (isAvailable && !isBusy) {
                                onProviderChange(providerKey);
                            }
                        }}
                        disabled={!isAvailable || isBusy}
                        aria-pressed={isSelected}
                    >
                        <span className="settings-radio-dot" aria-hidden="true" />
                        <span style={{ minWidth: 0 }}>
                            <span className="settings-control-row" style={{ gap: '8px' }}>
                                <span className="settings-radio-title">{info.label}</span>
                                {!isAvailable && <SettingsBadge tone="muted">不可用</SettingsBadge>}
                                {isSwitching && <SettingsBadge tone="accent">切换中</SettingsBadge>}
                            </span>
                            <span className="settings-radio-description">{info.description}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
