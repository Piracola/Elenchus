import { motion } from 'framer-motion';

import type { SearchProviderStatus, SearchProviderType } from '../../../types';
import { PROVIDER_INFO } from './searchConfigShared';

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(Object.keys(PROVIDER_INFO) as SearchProviderType[]).map((providerKey) => {
                const provider = providers.find((item) => item.name === providerKey);
                const info = PROVIDER_INFO[providerKey];
                const isSelected = currentProvider === providerKey;
                const isAvailable = provider?.available ?? false;
                const isSwitching = activeAction === `provider:${providerKey}`;

                return (
                    <motion.div
                        key={providerKey}
                        whileHover={isAvailable && !isBusy ? { scale: 1.01 } : {}}
                        onClick={() => {
                            if (isAvailable && !isBusy) {
                                onProviderChange(providerKey);
                            }
                        }}
                        style={{
                            padding: '16px 20px',
                            borderRadius: 'var(--radius-lg)',
                            background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                            border: `1px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                            cursor: isAvailable && !isBusy ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            transition: 'all var(--transition-fast)',
                            boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                            opacity: isAvailable ? 1 : 0.6,
                        }}
                    >
                        <div
                            style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                border: `2px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            {isSelected && (
                                <div
                                    style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        background: 'var(--accent-indigo)',
                                    }}
                                />
                            )}
                        </div>

                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    fontWeight: 700,
                                    fontSize: '15px',
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {info.label}
                                {!isAvailable && (
                                    <span
                                        style={{
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-sm)',
                                            color: 'var(--text-muted)',
                                            fontWeight: 500,
                                        }}
                                    >
                                        {'\u4e0d\u53ef\u7528'}
                                    </span>
                                )}
                            </div>
                            <div
                                style={{
                                    fontSize: '13px',
                                    color: 'var(--text-muted)',
                                    marginTop: '4px',
                                    lineHeight: 1.5,
                                }}
                            >
                                {info.description}
                            </div>
                        </div>

                        {isSwitching && (
                            <div style={{ fontSize: '12px', color: 'var(--accent-indigo)' }}>
                                {'\u5207\u6362\u4e2d...'}
                            </div>
                        )}
                    </motion.div>
                );
            })}
        </div>
    );
}
