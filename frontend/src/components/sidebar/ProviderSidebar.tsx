import { Plus, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { ModelConfig } from '../../types';
import { SettingsBadge } from './settings/SettingsPrimitives';

interface ProviderSidebarProps {
    providers: ModelConfig[];
    isLoading: boolean;
    activeIndex: number;
    isCreatingNew: boolean;
    onSelect: (idx: number) => void;
    onDelete: (id: string, e: MouseEvent) => void;
    onNew: () => void;
}

export function ProviderSidebar({
    providers,
    isLoading,
    activeIndex,
    isCreatingNew,
    onSelect,
    onDelete,
    onNew,
}: ProviderSidebarProps) {
    return (
        <section className="settings-provider-sidebar" aria-label="服务商列表">
            <div className="settings-provider-sidebar-header">
                <h4 className="settings-provider-sidebar-title">服务商</h4>
                <div className="settings-provider-sidebar-meta">
                    {isLoading ? '正在加载配置' : `${providers.length} 个已保存配置`}
                </div>
            </div>

            <div className="settings-provider-list">
                {isLoading ? (
                    <div className="settings-empty">加载中...</div>
                ) : (
                    <div className="settings-provider-list-items">
                        {providers.map((provider, idx) => {
                            const isActive = !isCreatingNew && activeIndex === idx;
                            return (
                                <div
                                    key={provider.id}
                                    className={`settings-provider-item ${isActive ? 'is-active' : ''}`}
                                    onClick={() => onSelect(idx)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            onSelect(idx);
                                        }
                                    }}
                                >
                                    <span style={{ minWidth: 0 }}>
                                        <span className="settings-provider-name">{provider.name}</span>
                                        <span className="settings-provider-meta">
                                            {provider.models?.length ?? 0} 个模型
                                        </span>
                                    </span>
                                    <span className="settings-provider-actions">
                                        {provider.is_default && (
                                            <SettingsBadge tone="warning">默认</SettingsBadge>
                                        )}
                                        {isActive && (
                                            <button
                                                type="button"
                                                aria-label={`删除服务商 ${provider.name}`}
                                                title="删除服务商"
                                                className="settings-icon-button"
                                                onClick={(event) => onDelete(provider.id, event)}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </span>
                                </div>
                            );
                        })}

                        <div
                            className={`settings-provider-item ${isCreatingNew ? 'is-active' : ''}`}
                            onClick={onNew}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onNew();
                                }
                            }}
                        >
                            <span style={{ minWidth: 0 }}>
                                <span className="settings-provider-name">添加提供商</span>
                                <span className="settings-provider-meta">创建新的模型接入</span>
                            </span>
                            <span className="settings-provider-actions">
                                <span className="settings-icon-button" aria-hidden="true">
                                    <Plus size={14} />
                                </span>
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
