import type { ReactNode } from 'react';
import {
    Check,
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

import type { ProviderFormData, RemoteModelCandidate } from '../../types';
import CustomSelect from '../shared/CustomSelect';
import {
    SettingsBadge,
    SettingsButton,
    SettingsField,
    SettingsInput,
    SettingsNotice,
    SettingsSection,
    SettingsTextarea,
} from './settings/SettingsPrimitives';

interface ProviderFormProps {
    formData: ProviderFormData;
    isCreatingNew: boolean;
    newModelInput: string;
    isProbing: boolean;
    isFetchingModels: boolean;
    probeMessage: string;
    probeStatus: 'idle' | 'success' | 'error';
    remoteModelCandidates: RemoteModelCandidate[];
    onFieldChange: <K extends keyof ProviderFormData>(field: K, value: ProviderFormData[K]) => void;
    onAddModel: () => void;
    onAddRemoteModel: (model: string) => void;
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
            className={`settings-checkbox-label ${disabled ? 'is-disabled' : ''}`}
        >
            <input
                id={id}
                className="settings-checkbox"
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
            />
            <span>{children}</span>
        </label>
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
    remoteModelCandidates,
    onFieldChange,
    onAddModel,
    onAddRemoteModel,
    onRemoveModel,
    onNewModelInputChange,
    onProbeProvider,
    onFetchRemoteModels,
    onSave,
}: ProviderFormProps) {
    const showConfiguredHint = !isCreatingNew && formData.apiKeyConfigured && !formData.clearApiKey && !formData.apiKey.trim();
    const hasUsableKey = Boolean(formData.apiKey.trim() || (formData.apiKeyConfigured && !formData.clearApiKey));
    const disableRemoteActions = !hasUsableKey || isProbing || isFetchingModels;
    const probeTone = probeStatus === 'success' ? 'success' : probeStatus === 'error' ? 'error' : 'neutral';
    const ProbeIcon = probeStatus === 'success' ? CheckCircle2 : probeStatus === 'error' ? XCircle : Wifi;

    return (
        <div className="settings-provider-form">
            <div className="settings-provider-form-header">
                <div>
                    <h3 className="settings-provider-form-title">
                        {isCreatingNew ? '配置新服务商' : '服务商配置'}
                    </h3>
                    <p className="settings-provider-form-description">
                        按使用顺序整理连接、模型和高级参数。
                    </p>
                </div>
                {formData.isDefault && <SettingsBadge tone="warning">全局默认</SettingsBadge>}
            </div>

            <div className="settings-provider-form-body">
                <div className="settings-provider-form-content">
                    <SettingsSection
                        title="基础信息"
                        description="先命名服务商并选择兼容的接入协议。"
                        icon={<Server size={15} />}
                    >
                        <div className="settings-form-grid">
                            <SettingsField label="提供商名称 *">
                                <SettingsInput
                                    type="text"
                                    value={formData.name}
                                    onChange={(event) => onFieldChange('name', event.target.value)}
                                    placeholder="如：AiHubMix / DeepSeek"
                                />
                            </SettingsField>
                            <SettingsField label="接入协议">
                                <CustomSelect
                                    value={formData.providerType}
                                    options={PROVIDER_OPTIONS}
                                    onChange={(value) => onFieldChange('providerType', value)}
                                    size="lg"
                                    width="100%"
                                />
                            </SettingsField>
                        </div>

                        <InlineToggle
                            id="isDefaultToggle"
                            checked={formData.isDefault}
                            onChange={(checked) => onFieldChange('isDefault', checked)}
                        >
                            设为全局默认服务商
                        </InlineToggle>
                    </SettingsSection>

                    <SettingsSection
                        title="连接配置"
                        description="填写密钥和 API 地址后，可以直接检测服务商是否可用。"
                        icon={<Wifi size={15} />}
                    >
                        <SettingsField
                            label="API 密钥"
                            htmlFor="providerApiKey"
                            hint={isCreatingNew
                                ? '新建时可直接填写 API Key。'
                                : '编辑时留空会保留当前密钥，填写新值会替换。'}
                        >
                            <SettingsInput
                                id="providerApiKey"
                                type="password"
                                value={formData.apiKey}
                                onChange={(event) => onFieldChange('apiKey', event.target.value)}
                                placeholder={showConfiguredHint ? '已配置，留空则保持不变' : 'sk-...'}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                        </SettingsField>

                        {!isCreatingNew && formData.apiKeyConfigured && (
                            <InlineToggle
                                id="clearProviderApiKey"
                                checked={formData.clearApiKey}
                                disabled={Boolean(formData.apiKey.trim())}
                                onChange={(checked) => onFieldChange('clearApiKey', checked)}
                            >
                                清除已保存的 API 密钥
                            </InlineToggle>
                        )}

                        <SettingsField
                            label="API Base URL"
                            hint="留空时使用当前协议的官方默认地址，兼容聚合服务时填写自定义地址。"
                        >
                            <SettingsInput
                                type="text"
                                value={formData.apiBaseUrl}
                                onChange={(event) => onFieldChange('apiBaseUrl', event.target.value)}
                                placeholder="https://api.example.com/v1"
                            />
                        </SettingsField>

                        <div className="settings-control-row settings-control-row--start">
                            <SettingsNotice tone={probeTone} icon={<ProbeIcon size={15} />}>
                                {probeMessage || '检测结果会显示在这里'}
                            </SettingsNotice>
                            <SettingsButton
                                onClick={onProbeProvider}
                                disabled={disableRemoteActions}
                                title="检测当前服务商连接"
                                icon={isProbing
                                    ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <Wifi size={15} />}
                            >
                                检测连接
                            </SettingsButton>
                        </div>
                    </SettingsSection>

                    <SettingsSection
                        title="模型管理"
                        description="维护当前服务商可用于对话的模型标识。"
                        icon={<Server size={15} />}
                    >
                        <div className="settings-control-row">
                            <SettingsBadge tone="muted">已关联 {formData.models.length} 个模型</SettingsBadge>
                            <SettingsButton
                                onClick={onFetchRemoteModels}
                                disabled={disableRemoteActions}
                                title="从服务商获取模型列表"
                                icon={isFetchingModels
                                    ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <Download size={15} />}
                            >
                                获取模型列表
                            </SettingsButton>
                        </div>

                        <div className="settings-model-chip-list">
                            {formData.models.length === 0 ? (
                                <div className="settings-empty">暂无模型，手动添加或从服务商获取。</div>
                            ) : formData.models.map((model) => (
                                <span className="settings-model-chip" key={model}>
                                    <span>{model}</span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveModel(model)}
                                        aria-label={`移除模型 ${model}`}
                                        className="settings-icon-button"
                                        style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)' }}
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>

                        <div className="settings-inline-controls" style={{ alignItems: 'stretch' }}>
                            <SettingsInput
                                type="text"
                                value={newModelInput}
                                onChange={(event) => onNewModelInputChange(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        onAddModel();
                                    }
                                }}
                                placeholder="输入模型标识，如 gpt-4o 或 claude-3-opus"
                                style={{ flex: '1 1 260px' }}
                            />
                            <SettingsButton
                                onClick={onAddModel}
                                title="添加模型"
                                icon={<Plus size={15} />}
                            >
                                添加
                            </SettingsButton>
                        </div>

                        <div className="settings-remote-model-list">
                            <div>
                                <div className="settings-field-label" style={{ marginBottom: 0 }}>
                                    已获取模型列表
                                </div>
                                <div className="settings-field-hint">
                                    获取后会先显示在这里，点击“添加到配置”后才会加入当前服务商配置。
                                </div>
                            </div>

                            {remoteModelCandidates.length === 0 ? (
                                <div className="settings-empty">还没有获取到模型列表。</div>
                            ) : remoteModelCandidates.map((candidate) => (
                                <div className="settings-remote-model-row" key={candidate.id}>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="settings-remote-model-name">{candidate.name}</div>
                                        <div className="settings-remote-model-status">
                                            {candidate.added ? '已加入当前配置' : '尚未加入当前配置'}
                                        </div>
                                    </div>
                                    <SettingsButton
                                        size="sm"
                                        onClick={() => onAddRemoteModel(candidate.name)}
                                        disabled={candidate.added}
                                        icon={candidate.added ? <Check size={14} /> : <Plus size={14} />}
                                    >
                                        {candidate.added ? '已添加' : '添加到配置'}
                                    </SettingsButton>
                                </div>
                            ))}
                        </div>
                    </SettingsSection>

                    <SettingsSection
                        title="高级参数"
                        description="一般保持默认，需要特殊参数时再调整。"
                        icon={<Settings2 size={15} />}
                    >
                        <SettingsField
                            label="默认 Max Tokens"
                            hint="作为该服务商的默认输出上限。系统默认最大输入按 128k 约定，默认输出为 64k。"
                        >
                            <SettingsInput
                                type="number"
                                value={formData.defaultMaxTokens}
                                onChange={(event) => onFieldChange('defaultMaxTokens', event.target.value)}
                                placeholder="64000"
                                min={1}
                                step={1}
                            />
                        </SettingsField>

                        {formData.providerType === 'openai' && (
                            <InlineToggle
                                id="enableThinkingToggle"
                                checked={formData.enableThinking}
                                onChange={(checked) => onFieldChange('enableThinking', checked)}
                            >
                                启用思考模式（显示模型推理过程）
                            </InlineToggle>
                        )}

                        <SettingsField label="原始参数" hint="可填写 JSON 对象，或直接写键值行。">
                            <SettingsTextarea
                                value={formData.customParametersText}
                                onChange={(event) => onFieldChange('customParametersText', event.target.value)}
                                placeholder={`{\n  "reasoning_effort": "medium"\n}`}
                                spellCheck={false}
                                rows={4}
                                style={{
                                    fontFamily: 'Consolas, "SFMono-Regular", Menlo, monospace',
                                    fontSize: 13,
                                }}
                            />
                        </SettingsField>
                    </SettingsSection>
                </div>
            </div>

            <div className="settings-provider-form-footer">
                <SettingsButton
                    variant="primary"
                    size="lg"
                    onClick={onSave}
                    icon={<Save size={16} />}
                >
                    保存配置
                </SettingsButton>
            </div>
        </div>
    );
}
