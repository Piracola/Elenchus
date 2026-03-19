import type { ProviderFormData } from '../../types';
import CustomSelect from '../shared/CustomSelect';

interface ProviderFormProps {
    formData: ProviderFormData;
    isCreatingNew: boolean;
    newModelInput: string;
    onFieldChange: <K extends keyof ProviderFormData>(field: K, value: ProviderFormData[K]) => void;
    onAddModel: () => void;
    onRemoveModel: (mod: string) => void;
    onNewModelInputChange: (value: string) => void;
    onSave: () => void;
    onClose: () => void;
}

const PROVIDER_OPTIONS = [
    { value: 'openai', label: 'OpenAI 兼容协议', icon: '🔌' },
    { value: 'anthropic', label: 'Anthropic API', icon: '🅰️' },
    { value: 'gemini', label: 'Google Gemini API', icon: '🔷' },
];

export function ProviderForm({
    formData,
    isCreatingNew,
    newModelInput,
    onFieldChange,
    onAddModel,
    onRemoveModel,
    onNewModelInputChange,
    onSave,
    onClose,
}: ProviderFormProps) {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '14px',
                    right: '14px',
                    zIndex: 10,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '22px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                }}
            >
                ×
            </button>

            <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
                    <h3 style={{ fontSize: '18px', margin: '0 0 6px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {isCreatingNew ? '配置新提供商' : '服务商配置'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>定义连接参数及挂载的子模型</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            提供商名称 *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => onFieldChange('name', e.target.value)}
                            placeholder="如：AiHubMix / DeepSeek"
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                    </div>

                    <div>
                        <CustomSelect
                            label="接入协议"
                            value={formData.providerType}
                            options={PROVIDER_OPTIONS}
                            onChange={(value) => onFieldChange('providerType', value)}
                            size="md"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            API 密钥
                        </label>
                        <input
                            type="password"
                            value={formData.apiKey}
                            onChange={e => onFieldChange('apiKey', e.target.value)}
                            placeholder="sk-..."
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            API Base URL
                        </label>
                        <input
                            type="text"
                            value={formData.apiBaseUrl}
                            onChange={e => onFieldChange('apiBaseUrl', e.target.value)}
                            placeholder="https://api.example.com/v1"
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            原始参数
                        </label>
                        <textarea
                            value={formData.customParametersText}
                            onChange={e => onFieldChange('customParametersText', e.target.value)}
                            placeholder={`{\n  "reasoning_effort": "medium"\n}`}
                            spellCheck={false}
                            rows={7}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                fontFamily: 'Consolas, "SFMono-Regular", Menlo, monospace',
                                outline: 'none',
                                resize: 'vertical',
                                lineHeight: 1.5,
                                transition: 'border-color 0.15s ease',
                                minHeight: '120px',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            可填写 JSON 对象，或直接写键值行，例如 `"reasoning_effort": "medium",`。
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <input
                            type="checkbox"
                            id="isDefaultToggle"
                            checked={formData.isDefault}
                            onChange={e => onFieldChange('isDefault', e.target.checked)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <label htmlFor="isDefaultToggle" style={{ fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                            设为全局默认服务商
                        </label>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                    <h4 style={{ fontSize: '14px', margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>关联模型</h4>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {formData.models.map(mod => (
                            <div
                                key={mod}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '5px 10px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '12px',
                                    color: 'var(--text-primary)',
                                    fontWeight: 500,
                                }}
                            >
                                {mod}
                                <button
                                    onClick={() => onRemoveModel(mod)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0',
                                        fontSize: '14px',
                                        width: '16px',
                                        height: '16px',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose)'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                        <input
                            type="text"
                            value={newModelInput}
                            onChange={e => onNewModelInputChange(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && onAddModel()}
                            placeholder="输入模型标识 (例如 gpt-4o, claude-3-opus)"
                            style={{
                                flex: 1,
                                padding: '9px 12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                        <button
                            onClick={onAddModel}
                            style={{
                                padding: '0 14px',
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--text-primary)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            添加
                        </button>
                    </div>
                </div>
            </div>

            <div style={{
                padding: '14px 32px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 'auto'
            }}>
                <button
                    onClick={onSave}
                    style={{
                        padding: '9px 22px',
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '13px',
                        transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                    保存配置
                </button>
            </div>
        </div>
    );
}
