import type { ContextRuntimeConfig } from '../types/session';

export type ContextInjectionMode = ContextRuntimeConfig['context_injection_mode'];

type ContextPolicyValues = Pick<
    ContextRuntimeConfig,
    | 'recent_turns_to_include'
    | 'evidence_items_per_agent'
    | 'exact_recent_entries_per_agent'
    | 'planning_entries_per_agent'
    | 'long_term_memory_entries_per_agent'
>;

export const CONTEXT_INJECTION_MODE_OPTIONS: Array<{
    value: ContextInjectionMode;
    label: string;
    description: string;
}> = [
    {
        value: 'auto',
        label: '自动（推荐）',
        description: '系统按辩论长度、资料量和历史内容自动分配上下文。',
    },
    {
        value: 'lean',
        label: '精简',
        description: '更快更省 token，适合短辩论或上下文较小的模型。',
    },
    {
        value: 'standard',
        label: '标准',
        description: '兼顾质量和成本，适合大多数日常辩论。',
    },
    {
        value: 'deep',
        label: '深入',
        description: '注入更多历史、证据和记忆，适合长辩论或资料多的场景。',
    },
    {
        value: 'custom',
        label: '自定义',
        description: '手动接管下面的高级参数，适合调试或特殊场景。',
    },
];

export const CONTEXT_POLICY_PRESETS: Record<Exclude<ContextInjectionMode, 'auto' | 'custom'>, ContextPolicyValues> = {
    lean: {
        recent_turns_to_include: 1,
        evidence_items_per_agent: 2,
        exact_recent_entries_per_agent: 3,
        planning_entries_per_agent: 1,
        long_term_memory_entries_per_agent: 2,
    },
    standard: {
        recent_turns_to_include: 2,
        evidence_items_per_agent: 4,
        exact_recent_entries_per_agent: 4,
        planning_entries_per_agent: 2,
        long_term_memory_entries_per_agent: 4,
    },
    deep: {
        recent_turns_to_include: 4,
        evidence_items_per_agent: 8,
        exact_recent_entries_per_agent: 8,
        planning_entries_per_agent: 4,
        long_term_memory_entries_per_agent: 8,
    },
};

export const DEFAULT_CONTEXT_INJECTION_MODE: ContextInjectionMode = 'auto';
export const DEFAULT_CONTEXT_POLICY_VALUES: ContextPolicyValues = CONTEXT_POLICY_PRESETS.standard;

export function normalizeContextInjectionMode(value: unknown): ContextInjectionMode {
    if (
        value === 'auto'
        || value === 'lean'
        || value === 'standard'
        || value === 'deep'
        || value === 'custom'
    ) {
        return value;
    }
    return DEFAULT_CONTEXT_INJECTION_MODE;
}

export function valuesForContextInjectionMode(
    mode: ContextInjectionMode,
    currentValues: ContextPolicyValues,
): ContextPolicyValues {
    if (mode === 'lean' || mode === 'standard' || mode === 'deep') {
        return CONTEXT_POLICY_PRESETS[mode];
    }
    if (mode === 'auto') {
        return DEFAULT_CONTEXT_POLICY_VALUES;
    }
    return currentValues;
}
