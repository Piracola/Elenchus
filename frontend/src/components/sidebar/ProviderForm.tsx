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
    const showConfiguredHint = !isCreatingNew && formData.apiKeyConfigured && !formData.clearApiKey && !formData.apiKey.trim();

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '18px',
                    right: '18px',
                    zIndex: 10,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '32px',
                    width: '42px',
                    height: '42px',
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

            <div style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '18px' }}>
                    <h3 style={{ fontSize: '28px', margin: '0 0 12px', color: 'var(--text-primary)', fontWeight: 700 }}>
                        {isCreatingNew ? '配置新提供商' : '服务商配置'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '17px', color: 'var(--text-muted)', lineHeight: 1.75 }}>定义连接参数及挂载的子模型</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '16px', marginBottom: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            提供商名称 *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => onFieldChange('name', e.target.value)}
                            placeholder="如：AiHubMix / DeepSeek"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '16px',
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
                        <label htmlFor="providerApiKey" style={{ display: 'block', fontSize: '16px', marginBottom: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            API 密钥
                        </label>
                        <input
                            id="providerApiKey"
                            type="password"
                            value={formData.apiKey}
                            onChange={e => onFieldChange('apiKey', e.target.value)}
                            placeholder={showConfiguredHint ? '已配置，留空则保持不变' : 'sk-...'}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-indigo)';
                            }}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                        <div style={{ marginTop: '10px', fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1.75 }}>
                            {isCreatingNew
                                ? '新建时可直接填写 API Key。'
                                : '编辑已有配置时，留空会保留当前密钥；填写新值会替换当前密钥。'}
                        </div>
                        {!isCreatingNew && formData.apiKeyConfigured && (
                            <label htmlFor="clearProviderApiKey" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input
                                    id="clearProviderApiKey"
                                    type="checkbox"
                                    checked={formData.clearApiKey}
                                    onChange={(e) => onFieldChange('clearApiKey', e.target.checked)}
                                    disabled={Boolean(formData.apiKey.trim())}
                                    style={{ cursor: formData.apiKey.trim() ? 'not-allowed' : 'pointer', width: '20px', height: '20px' }}
                                />
                                清除已保存的 API 密钥
                            </label>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '16px', marginBottom: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            API Base URL
                        </label>
                        <input
                            type="text"
                            value={formData.apiBaseUrl}
                            onChange={e => onFieldChange('apiBaseUrl', e.target.value)}
                            placeholder="https://api.example.com/v1"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '16px', marginBottom: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            默认 Max Tokens
                        </label>
                        <input
                            type="number"
                            value={formData.defaultMaxTokens}
                            onChange={e => onFieldChange('defaultMaxTokens', e.target.value)}
                            placeholder="64000"
                            min={1}
                            step={1}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '17px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                        <div style={{ marginTop: '10px', fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1.75 }}>
                            作为该服务商的默认输出上限。当前系统默认最大输入按 128k 约定，默认最大输出为 64k；会话或角色单独设置了 max_tokens 时，会覆盖这里。
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '16px', marginBottom: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
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
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '16px',
                                fontFamily: 'Consolas, "SFMono-Regular", Menlo, monospace',
                                outline: 'none',
                                resize: 'vertical',
                                lineHeight: 1.65,
                                transition: 'border-color 0.15s ease',
                                minHeight: '136px',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                        <div style={{ marginTop: '10px', fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1.75 }}>
                            可填写 JSON 对象，或直接写键值行，例如 `"reasoning_effort": "medium",`。
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                        <input
                            type="checkbox"
                            id="isDefaultToggle"
                            checked={formData.isDefault}
                            onChange={e => onFieldChange('isDefault', e.target.checked)}
                            style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                        />
                        <label htmlFor="isDefaultToggle" style={{ fontSize: '16px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                            设为全局默认服务商
                        </label>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', flex: 1 }}>
                    <h4 style={{ fontSize: '21px', margin: 0, color: 'var(--text-primary)', fontWeight: 700 }}>关联模型</h4>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {formData.models.map(mod => (
                            <div
                                key={mod}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 14px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '16px',
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
                                        fontSize: '18px',
                                        width: '20px',
                                        height: '20px',
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

                    <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
                        <input
                            type="text"
                            value={newModelInput}
                            onChange={e => onNewModelInputChange(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && onAddModel()}
                            placeholder="输入模型标识 (例如 gpt-4o, claude-3-opus)"
                            style={{
                                flex: 1,
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease',
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-indigo)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        />
                        <button
                            onClick={onAddModel}
                            style={{
                                padding: '0 22px',
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '16px',
                                fontWeight: 600,
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
                padding: '18px 40px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 'auto'
            }}>
                <button
                    onClick={onSave}
                    style={{
                        padding: '12px 28px',
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '16px',
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
