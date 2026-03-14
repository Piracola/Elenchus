import type { ModelConfig } from '../../types';

interface ProviderSidebarProps {
    providers: ModelConfig[];
    isLoading: boolean;
    activeIndex: number;
    isCreatingNew: boolean;
    onSelect: (idx: number) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
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
        <div style={{
            width: '240px',
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    模型服务商
                </h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {isLoading ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>加载中...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {providers.map((p, idx) => (
                            <div
                                key={p.id}
                                onClick={() => onSelect(idx)}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: (!isCreatingNew && activeIndex === idx) ? 'var(--bg-tertiary)' : 'transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    color: (!isCreatingNew && activeIndex === idx) ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontWeight: (!isCreatingNew && activeIndex === idx) ? 600 : 400,
                                }}
                            >
                                <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {p.name}
                                    {p.is_default && <span title="默认服务商" style={{ fontSize: '11px', color: '#f59e0b' }}>⭐</span>}
                                </span>
                                {(!isCreatingNew && activeIndex === idx) && (
                                    <button
                                        onClick={(e) => onDelete(p.id, e)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}

                        <div
                            onClick={onNew}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 'var(--radius-sm)',
                                background: isCreatingNew ? 'var(--bg-tertiary)' : 'transparent',
                                cursor: 'pointer',
                                color: isCreatingNew ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: isCreatingNew ? 600 : 400,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <span style={{ fontSize: '13px' }}>+ 添加提供商</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
