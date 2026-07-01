import { useEffect, useState } from 'react';
import { BrainCircuit, SlidersHorizontal } from 'lucide-react';

import { api } from '../../../api/client';
import type { ModelConfig } from '../../../types';
import type { ContextRuntimeConfig } from '../../../types/session';
import CustomSelect from '../../shared/CustomSelect';
import {
    buildModelConfigOptions,
    buildSelectedConfigKey,
    DEFAULT_MODEL_CONFIG_VALUE,
    splitSelectedConfigKey,
} from '../../../utils/agent/agentConfigs';
import {
    CONTEXT_INJECTION_MODE_OPTIONS,
    DEFAULT_CONTEXT_POLICY_VALUES,
    normalizeContextInjectionMode,
    valuesForContextInjectionMode,
    type ContextInjectionMode,
} from '../../../utils/contextRuntime';
import { SettingsRadioCardGroup } from './SettingsRadioCardGroup';
import {
    SettingsButton,
    SettingsField,
    SettingsInput,
    SettingsNotice,
    SettingsPage,
    SettingsSection,
} from './SettingsPrimitives';

type ContextPolicyField = keyof typeof DEFAULT_CONTEXT_POLICY_VALUES;

const CONTEXT_POLICY_FIELD_HINTS: Record<ContextPolicyField, string> = {
    recent_turns_to_include:
        '先限定“往前看几轮”。调大后，辩手更容易接住前几轮攻防；调小后，提示词更短，但可能忘掉较早铺垫。',
    evidence_items_per_agent:
        '从事实、引用资料和检索结果里挑多少条高优先级证据。调大后论证材料更足；调小后更省 token，也能减少无关材料干扰。',
    exact_recent_entries_per_agent:
        '在最近回合范围内，最多保留多少条逐字原文。调大后更不容易误解对方原话；调小后会更多依赖摘要和记忆。',
    planning_entries_per_agent:
        '每轮正式发言前，把几条组内讨论/赛前简报交给辩手。调大后更能执行团队策略；调小后可避免讨论内容喧宾夺主。',
    long_term_memory_entries_per_agent:
        '带入多少条长期记忆或轮次摘要。调大后更适合长辩论和连续追踪；调小后当前轮更轻、更少被历史包袱影响。',
};

interface Props {
    providers: ModelConfig[];
    contextRuntime: ContextRuntimeConfig;
    setContextRuntime: (settings: Partial<ContextRuntimeConfig>) => void;
}

export function SettingsContextTab({
    providers,
    contextRuntime,
    setContextRuntime,
}: Props) {
    const recentTurnsInputId = 'context-runtime-recent-turns';
    const evidenceItemsInputId = 'context-runtime-evidence-items';
    const exactRecentEntriesInputId = 'context-runtime-exact-recent-entries';
    const planningEntriesInputId = 'context-runtime-planning-entries';
    const memoryEntriesInputId = 'context-runtime-memory-entries';
    const modelConfigOptions = buildModelConfigOptions(providers);
    const selectedModelConfigValue = buildSelectedConfigKey(providers, {
        providerId: contextRuntime.low_cost_model_provider_id,
        model: contextRuntime.low_cost_model_id,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(
        normalizeContextInjectionMode(contextRuntime.context_injection_mode) === 'custom',
    );
    const [message, setMessage] = useState('');
    const [tone, setTone] = useState<'info' | 'success' | 'error'>('info');
    const selectedContextMode = normalizeContextInjectionMode(contextRuntime.context_injection_mode);
    const isCustomMode = selectedContextMode === 'custom';
    const advancedVisible = showAdvanced || isCustomMode;

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const runtime = await api.settings.getRuntime();
                if (cancelled) return;
                setContextRuntime(runtime.debate.context_runtime);
            } catch (error) {
                if (cancelled) return;
                setTone('error');
                setMessage(error instanceof Error ? error.message : '加载上下文设置失败。');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [setContextRuntime]);

    const save = async () => {
        try {
            setIsSaving(true);
            setMessage('');
            const selection = splitSelectedConfigKey(selectedModelConfigValue);
            const payload = {
                debate: {
                    context_runtime: {
                        ...contextRuntime,
                        use_low_cost_context_model: true,
                        low_cost_model_provider_id: selection.providerId || null,
                        low_cost_model_id: selection.model || null,
                    },
                },
            };
            const result = await api.settings.updateRuntime(payload);
            setContextRuntime(result.debate.context_runtime);
            setTone('success');
            setMessage('上下文工程设置已保存。');
        } catch (error) {
            setTone('error');
            setMessage(error instanceof Error ? error.message : '保存上下文设置失败。');
        } finally {
            setIsSaving(false);
        }
    };

    const selectContextMode = (mode: ContextInjectionMode) => {
        const patch = valuesForContextInjectionMode(mode, {
            recent_turns_to_include: contextRuntime.recent_turns_to_include,
            evidence_items_per_agent: contextRuntime.evidence_items_per_agent,
            exact_recent_entries_per_agent: contextRuntime.exact_recent_entries_per_agent,
            planning_entries_per_agent: contextRuntime.planning_entries_per_agent,
            long_term_memory_entries_per_agent: contextRuntime.long_term_memory_entries_per_agent,
        });
        setContextRuntime({
            context_injection_mode: mode,
            ...patch,
        });
        setShowAdvanced(mode === 'custom');
    };

    const updateCustomPolicyValue = (
        key: keyof typeof DEFAULT_CONTEXT_POLICY_VALUES,
        value: number,
    ) => {
        setContextRuntime({
            context_injection_mode: 'custom',
            [key]: value,
        });
        setShowAdvanced(true);
    };

    const modeSummary = selectedContextMode === 'auto'
        ? '自动模式会在轻量辩论中偏精简，在长辩论、资料多或历史变长时自动增加上下文。'
        : selectedContextMode === 'custom'
            ? '自定义模式会严格使用下面高级设置里的数字。'
            : `当前模式会使用固定预算：最近 ${contextRuntime.recent_turns_to_include} 轮、证据 ${contextRuntime.evidence_items_per_agent} 条、近文 ${contextRuntime.exact_recent_entries_per_agent} 条、赛前讨论 ${contextRuntime.planning_entries_per_agent} 条、长期记忆 ${contextRuntime.long_term_memory_entries_per_agent} 条。`;

    return (
        <SettingsPage
            title="上下文工程"
            description="控制上下文注入范围，并为上下文整理步骤选择专用模型。"
        >
            <SettingsSection
                title="上下文注入"
                description="让每个 agent 只吃到当前轮真正需要的信息。"
                icon={<BrainCircuit size={16} />}
            >
                <SettingsRadioCardGroup
                    options={CONTEXT_INJECTION_MODE_OPTIONS}
                    selectedValue={selectedContextMode}
                    onSelect={selectContextMode}
                />
                <SettingsNotice tone="info">{modeSummary}</SettingsNotice>
                <div className="settings-control-row">
                    <div className="settings-field-hint">
                        大多数情况下保持“自动”即可；只有在排查上下文过多或过少时再打开高级设置。
                    </div>
                    <SettingsButton
                        variant="ghost"
                        size="sm"
                        icon={<SlidersHorizontal size={14} />}
                        onClick={() => setShowAdvanced((value) => !value)}
                        disabled={isCustomMode}
                    >
                        {advancedVisible ? '高级设置已展开' : '展开高级设置'}
                    </SettingsButton>
                </div>
                {advancedVisible ? (
                    <div className="settings-context-advanced">
                        <div className="settings-context-explainer">
                            <h5 className="settings-context-explainer-title">注入机制怎么工作</h5>
                            <p>
                                每次轮到某个 agent 发言前，系统不会把整场辩论全部塞给模型，而是先按下面 5 个预算挑材料，
                                再拼成一个“上下文包”：当前任务、实时约束、赛前讨论、最近原文、角色记忆、证据、裁判反馈和历史摘要。
                            </p>
                            <p>
                                这些数字调大，通常会让 agent 看到更多信息，适合长辩论、资料多、攻防链很长的场景；
                                但也会增加 token 消耗，并可能把不重要的信息一起带进去。调小则更快、更省、更聚焦，
                                但可能漏掉较早的铺垫、证据或团队策略。
                            </p>
                        </div>
                        <div className="settings-form-grid">
                            <SettingsField
                                label="最近回合数"
                                htmlFor={recentTurnsInputId}
                                hint={CONTEXT_POLICY_FIELD_HINTS.recent_turns_to_include}
                            >
                                <SettingsInput
                                    id={recentTurnsInputId}
                                    type="number"
                                    min={1}
                                    max={8}
                                    value={String(contextRuntime.recent_turns_to_include)}
                                    onChange={(event) =>
                                        updateCustomPolicyValue('recent_turns_to_include', Number(event.target.value) || 2)
                                    }
                                />
                            </SettingsField>
                            <SettingsField
                                label="证据条目数"
                                htmlFor={evidenceItemsInputId}
                                hint={CONTEXT_POLICY_FIELD_HINTS.evidence_items_per_agent}
                            >
                                <SettingsInput
                                    id={evidenceItemsInputId}
                                    type="number"
                                    min={1}
                                    max={12}
                                    value={String(contextRuntime.evidence_items_per_agent)}
                                    onChange={(event) =>
                                        updateCustomPolicyValue('evidence_items_per_agent', Number(event.target.value) || 4)
                                    }
                                />
                            </SettingsField>
                            <SettingsField
                                label="逐字近文数"
                                htmlFor={exactRecentEntriesInputId}
                                hint={CONTEXT_POLICY_FIELD_HINTS.exact_recent_entries_per_agent}
                            >
                                <SettingsInput
                                    id={exactRecentEntriesInputId}
                                    type="number"
                                    min={1}
                                    max={12}
                                    value={String(contextRuntime.exact_recent_entries_per_agent)}
                                    onChange={(event) =>
                                        updateCustomPolicyValue('exact_recent_entries_per_agent', Number(event.target.value) || 4)
                                    }
                                />
                            </SettingsField>
                            <SettingsField
                                label="赛前讨论条目数"
                                htmlFor={planningEntriesInputId}
                                hint={CONTEXT_POLICY_FIELD_HINTS.planning_entries_per_agent}
                            >
                                <SettingsInput
                                    id={planningEntriesInputId}
                                    type="number"
                                    min={0}
                                    max={6}
                                    value={String(contextRuntime.planning_entries_per_agent)}
                                    onChange={(event) =>
                                        updateCustomPolicyValue('planning_entries_per_agent', Number(event.target.value) || 0)
                                    }
                                />
                            </SettingsField>
                            <SettingsField
                                label="长期记忆条目数"
                                htmlFor={memoryEntriesInputId}
                                hint={CONTEXT_POLICY_FIELD_HINTS.long_term_memory_entries_per_agent}
                            >
                                <SettingsInput
                                    id={memoryEntriesInputId}
                                    type="number"
                                    min={0}
                                    max={12}
                                    value={String(contextRuntime.long_term_memory_entries_per_agent)}
                                    onChange={(event) =>
                                        updateCustomPolicyValue('long_term_memory_entries_per_agent', Number(event.target.value) || 0)
                                    }
                                />
                            </SettingsField>
                        </div>
                    </div>
                ) : null}
            </SettingsSection>

            <SettingsSection
                title="上下文模型"
                description="这里的选择方式和辩手 agent 完全一致，会用于组内讨论、摘要和记忆整理等上下文处理步骤。"
            >
                <SettingsField
                    label="上下文模型"
                    hint="直接从已保存的模型配置里选一个；留默认配置时使用系统默认模型。"
                >
                    <CustomSelect
                        value={selectedModelConfigValue}
                        options={modelConfigOptions}
                        onChange={(selected) => {
                            if (selected === DEFAULT_MODEL_CONFIG_VALUE) {
                                setContextRuntime({
                                    use_low_cost_context_model: true,
                                    low_cost_model_provider_id: null,
                                    low_cost_model_id: null,
                                });
                                return;
                            }

                            const selection = splitSelectedConfigKey(selected);
                            setContextRuntime({
                                use_low_cost_context_model: true,
                                low_cost_model_provider_id: selection.providerId || null,
                                low_cost_model_id: selection.model || null,
                            });
                        }}
                        size="sm"
                        width="100%"
                    />
                </SettingsField>
            </SettingsSection>

            {message ? <SettingsNotice tone={tone}>{message}</SettingsNotice> : null}

            <div className="settings-provider-form-footer">
                <SettingsButton variant="primary" onClick={save} disabled={isSaving}>
                    {isSaving ? '保存中...' : '保存上下文设置'}
                </SettingsButton>
            </div>
        </SettingsPage>
    );
}
