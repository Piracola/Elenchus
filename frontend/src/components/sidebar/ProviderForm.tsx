import type { CSSProperties, FocusEvent, ReactNode } from 'react';
import {
    CheckCircle2,
    Download,
    Loader2,
    Plus,
    Save,
    Server,
    Settings2,
    Wifi,
    X,
    XCircle,
} from 'lucide-react';

import type { ProviderFormData } from '../../types';
import CustomSelect from '../shared/CustomSelect';

interface ProviderFormProps {
    formData: ProviderFormData;
    isCreatingNew: boolean;
    newModelInput: string;
    isProbing: boolean;
    isFetchingModels: boolean;
    probeMessage: string;
    probeStatus: 'idle' | 'success' | 'error';
    onFieldChange: <K extends keyof ProviderFormData>(field: K, value: ProviderFormData[K]) => void;
    onAddModel: () => void;
    onRemoveModel: (mod: string) => void;
    onNewModelInputChange: (value: string) => void;
    onProbeProvider: () => void;
    onFetchRemoteModels: () => void;
    onSave: () => void;
    onClose: () => void;
}

const PROVIDER_OPTIONS = [
    { value: 'openai', label: 'OpenAI 兼容协议', icon: <Server size={16} /> },
    { value: 'anthropic', label: 'Anthropic API', icon: <Server size={16} /> },
    { value: 'gemini', label: 'Google Gemini API', icon: <Server size={16} /> },
];

const fieldStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

const secondaryButtonStyle: CSSProperties = {
    minHeight: '40px',
    padding: '0 14px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
};

const disabledButtonStyle: CSSProperties = {
    opacity: 0.6,
    cursor: 'not-allowed',
};

function fieldFocus(e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--accent-indigo)';
}

function fieldBlur(e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--border-subtle)';
}

function SettingGroup({
    title,
    description,
    icon,
    children,
}: {
    title: string;
    description?: string;
    icon: ReactNode;
    children: ReactNode;
}) {
    return (
        <section
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                paddingBottom: '18px',
                borderBottom: '1px solid var(--border-subtle)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </div>
                <div>
                    <h4 style={{ fontSize: '16px', margin: 0, color: 'var(--text-primary)', fontWeight: 700 }}>
                        {title}
                    </h4>
                    {description && (
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {children}
        </section>
    );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
    return (
        <label
            htmlFor={htmlFor}
            style={{
                display: 'block',
                fontSize: '14px',
                marginBottom: '6px',
                color: 'var(--text-secondary)',
                fontWeight: 600,
            }}
        >
            {children}
        </label>
    );
}

function Hint({ children }: { children: ReactNode }) {
    return (
        <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {children}
        </div>
    );
}

function InlineToggle({
    id,
    checked,
    disabled,
    children,
    onChange,
}: {
    id: string;
    checked: boolean;
    disabled?: boolean;
    children: ReactNode;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label
            htmlFor={id}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: 600,
            }}
        >
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                style={{ cursor: disabled ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
            />
            {children}
        </label>
    );
}

function ActionButton({
    children,
    onClick,
    disabled,
    title,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                ...secondaryButtonStyle,
                ...(disabled ? disabledButtonStyle : {}),
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.borderColor = 'var(--text-primary)';
                e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
            }}
        >
            {children}
        </button>
    );
}

export function ProviderForm({
    formData,
    isCreatingNew,
    newModelInput,
    isProbing,
    isFetchingModels,
    probeMessage,
    probeStatus,
    onFieldChange,
    onAddModel,
    onRemoveModel,
    onNewModelInputChange,
    onProbeProvider,
    onFetchRemoteModels,
    onSave,
    onClose,
}: ProviderFormProps) {
    const showConfiguredHint = !isCreatingNew && formData.apiKeyConfigured && !formData.clearApiKey && !formData.apiKey.trim();
    const hasUsableKey = Boolean(formData.apiKey.trim() || (formData.apiKeyConfigured && !formData.clearApiKey));
    const disableRemoteActions = !hasUsableKey || isProbing || isFetchingModels;
    const statusColor = probeStatus === 'success'
        ? 'var(--accent-emerald)'
        : probeStatus === 'error'
            ? 'var(--accent-rose)'
            : 'var(--text-secondary)';

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' }}>
            <button
                type="button"
                onClick={onClose}
                aria-label="关闭设置"
                style={{
                    position: 'absolute',
                    top: '12px',
                    right: '16px',
                    zIndex: 10,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    width: '34px',
                    height: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-secondary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-muted)';
                }}
            >
                <X size={18} />
            </button>

            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
                <h3 style={{ fontSize: '18px', margin: '0', color: 'var(--text-primary)', fontWeight: 700 }}>
                    {isCreatingNew ? '配置新服务商' : '服务商配置'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    按使用顺序整理连接、模型和高级参数。
                </p>
            </div>

            <div style={{ flex: 1, padding: '20px 24px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <SettingGroup
                    title="基础信息"
                    description="先命名服务商并选择兼容的接入协议。"
                    icon={<Server size={16} />}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'end' }}>
                        <div>
                            <FieldLabel>提供商名称 *</FieldLabel>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => onFieldChange('name', e.target.value)}
                                placeholder="如：AiHubMix / DeepSeek"
                                style={fieldStyle}
                                onFocus={fieldFocus}
                                onBlur={fieldBlur}
                            />
                        </div>
                        <div>
                            <FieldLabel>接入协议</FieldLabel>
                            <CustomSelect
                                value={formData.providerType}
                                options={PROVIDER_OPTIONS}
                                onChange={(value) => onFieldChange('providerType', value)}
                                size="lg"
                            />
                        </div>
                    </div>

                    <InlineToggle
                        id="isDefaultToggle"
                        checked={formData.isDefault}
                        onChange={(checked) => onFieldChange('isDefault', checked)}
                    >
                        设为全局默认服务商
                    </InlineToggle>
                </SettingGroup>

                <SettingGroup
                    title="连接配置"
                    description="填写密钥和 API 地址后，可以直接检测服务商是否可用。"
                    icon={<Wifi size={16} />}
                >
                    <div>
                        <FieldLabel htmlFor="providerApiKey">API 密钥</FieldLabel>
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
                            style={fieldStyle}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                        <Hint>
                            {isCreatingNew
                                ? '新建时可直接填写 API Key。'
                                : '编辑时留空会保留当前密钥，填写新值会替换。'}
                        </Hint>
                        {!isCreatingNew && formData.apiKeyConfigured && (
                            <div style={{ marginTop: '8px' }}>
                                <InlineToggle
                                    id="clearProviderApiKey"
                                    checked={formData.clearApiKey}
                                    disabled={Boolean(formData.apiKey.trim())}
                                    onChange={(checked) => onFieldChange('clearApiKey', checked)}
                                >
                                    清除已保存的 API 密钥
                                </InlineToggle>
                            </div>
                        )}
                    </div>

                    <div>
                        <FieldLabel>API Base URL</FieldLabel>
                        <input
                            type="text"
                            value={formData.apiBaseUrl}
                            onChange={e => onFieldChange('apiBaseUrl', e.target.value)}
                            placeholder="https://api.example.com/v1"
                            style={fieldStyle}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                        <Hint>留空时使用当前协议的官方默认地址，兼容聚合服务时填写自定义地址。</Hint>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '24px', color: statusColor, fontSize: '13px', fontWeight: 600 }}>
                            {probeStatus === 'success' && <CheckCircle2 size={16} />}
                            {probeStatus === 'error' && <XCircle size={16} />}
                            {probeMessage || '检测结果会显示在这里'}
                        </div>
                        <ActionButton
                            onClick={onProbeProvider}
                            disabled={disableRemoteActions}
                            title="检测当前服务商连接"
                        >
                            {isProbing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={16} />}
                            检测连接
                        </ActionButton>
                    </div>
                </SettingGroup>

                <SettingGroup
                    title="模型管理"
                    description="维护当前服务商可用于对话的模型标识。"
                    icon={<Server size={16} />}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            已关联 {formData.models.length} 个模型
                        </div>
                        <ActionButton
                            onClick={onFetchRemoteModels}
                            disabled={disableRemoteActions}
                            title="从服务商获取模型列表并合并到当前列表"
                        >
                            {isFetchingModels ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />}
                            获取模型列表
                        </ActionButton>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '34px' }}>
                        {formData.models.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
                                暂无模型，手动添加或从服务商获取。
                            </div>
                        ) : formData.models.map(mod => (
                            <div
                                key={mod}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 10px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    fontWeight: 500,
                                    maxWidth: '100%',
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {mod}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onRemoveModel(mod)}
                                    aria-label={`移除模型 ${mod}`}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0',
                                        width: '16px',
                                        height: '16px',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose)'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            value={newModelInput}
                            onChange={e => onNewModelInputChange(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && onAddModel()}
                            placeholder="输入模型标识 (例如 gpt-4o, claude-3-opus)"
                            style={{ ...fieldStyle, flex: 1 }}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                        <ActionButton onClick={onAddModel} title="添加模型">
                            <Plus size={16} />
                            添加
                        </ActionButton>
                    </div>
                </SettingGroup>

                <SettingGroup
                    title="高级参数"
                    description="一般保持默认，需要特殊参数时再调整。"
                    icon={<Settings2 size={16} />}
                >
                    <div>
                        <FieldLabel>默认 Max Tokens</FieldLabel>
                        <input
                            type="number"
                            value={formData.defaultMaxTokens}
                            onChange={e => onFieldChange('defaultMaxTokens', e.target.value)}
                            placeholder="64000"
                            min={1}
                            step={1}
                            style={fieldStyle}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                        <Hint>作为该服务商的默认输出上限。系统默认最大输入按 128k 约定，默认输出为 64k。</Hint>
                    </div>

                    {formData.providerType === 'openai' && (
                        <InlineToggle
                            id="enableThinkingToggle"
                            checked={formData.enableThinking}
                            onChange={(checked) => onFieldChange('enableThinking', checked)}
                        >
                            启用思考模式（显示模型推理过程）
                        </InlineToggle>
                    )}

                    <div>
                        <FieldLabel>原始参数</FieldLabel>
                        <textarea
                            value={formData.customParametersText}
                            onChange={e => onFieldChange('customParametersText', e.target.value)}
                            placeholder={`{\n  "reasoning_effort": "medium"\n}`}
                            spellCheck={false}
                            rows={4}
                            style={{
                                ...fieldStyle,
                                fontSize: '13px',
                                fontFamily: 'Consolas, "SFMono-Regular", Menlo, monospace',
                                resize: 'vertical',
                                lineHeight: 1.5,
                                minHeight: '90px',
                            }}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                        <Hint>可填写 JSON 对象，或直接写键值行。</Hint>
                    </div>
                </SettingGroup>
            </div>

            <div style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginTop: 'auto',
            }}>
                <div />
                <button
                    type="button"
                    onClick={onSave}
                    style={{
                        padding: '10px 22px',
                        minHeight: '40px',
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'opacity 0.15s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                    <Save size={16} />
                    保存配置
                </button>
            </div>
        </div>
    );
}
