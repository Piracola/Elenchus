import type { DialogueEntry, ScoreDimensionKey, ScoreModuleKey } from '../../../types';
import { SCORE_DIMENSIONS } from '../../../types';

export const COLLAPSED_AGENT_PLACEHOLDER = '该辩手正文已折叠';

export type RoleVisual = {
    badge: string;
    label: string;
    color: string;
    cardTint: string;
    glowTint: string;
};

export type JudgeVisual = {
    badge: string;
    label: string;
    color: string;
    background: string;
    border: string;
    glowTint: string;
};

const KNOWN_ROLE_VISUALS: Record<string, RoleVisual> = {
    proposer: {
        badge: '正',
        label: '正方',
        color: 'var(--color-proposer)',
        cardTint: 'rgba(52, 199, 89, 0.08)',
        glowTint: 'rgba(52, 199, 89, 0.35)',
    },
    opposer: {
        badge: '反',
        label: '反方',
        color: 'var(--color-opposer)',
        cardTint: 'rgba(255, 59, 48, 0.08)',
        glowTint: 'rgba(255, 59, 48, 0.35)',
    },
};

const EXTRA_ROLE_VISUALS: Omit<RoleVisual, 'badge' | 'label'>[] = [
    {
        color: 'var(--accent-indigo)',
        cardTint: 'rgba(99, 102, 241, 0.08)',
        glowTint: 'rgba(99, 102, 241, 0.35)',
    },
    {
        color: 'var(--accent-cyan)',
        cardTint: 'rgba(34, 211, 238, 0.08)',
        glowTint: 'rgba(34, 211, 238, 0.35)',
    },
    {
        color: 'var(--accent-amber)',
        cardTint: 'rgba(245, 158, 11, 0.08)',
        glowTint: 'rgba(245, 158, 11, 0.35)',
    },
];

export const DIMENSION_WEIGHT_MAP = Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [dimension.key, dimension.weight]),
) as Record<ScoreDimensionKey, number>;

export const MODULE_DIMENSIONS: Record<ScoreModuleKey, ScoreDimensionKey[]> = {
    foundation: ['evidence_quality', 'topic_focus'],
    confrontation: ['logical_rigor', 'rebuttal_strength'],
    stability: ['consistency'],
    vision: ['persuasiveness'],
};

export const STATIC_MOTION_PROPS = {
    initial: false,
    animate: undefined,
    transition: undefined,
    whileHover: undefined,
    whileTap: undefined,
} as const;

export function formatTurnPill(turn?: number): string | null {
    return typeof turn === 'number' && turn >= 0 ? `第 ${turn + 1} 轮` : null;
}

export function formatCollapsedHint(entry: DialogueEntry | null | undefined): string {
    const turnLabel = formatTurnPill(entry?.turn);
    return turnLabel ? `${turnLabel}发言已折叠` : COLLAPSED_AGENT_PLACEHOLDER;
}

export function collapseButtonLabel(collapsed: boolean): string {
    return collapsed ? '展开正文' : '折叠正文';
}

export function collapseButtonSymbol(collapsed: boolean): string {
    return collapsed ? '＋' : '－';
}

export function collapseButtonTitle(collapsed: boolean): string {
    return collapsed ? '展开这条辩手发言正文' : '折叠这条辩手发言正文';
}

export function agentMetaBackground(color: string): string {
    if (color === 'var(--color-opposer)') {
        return 'rgba(255, 59, 48, 0.10)';
    }
    if (color === 'var(--color-proposer)') {
        return 'rgba(52, 199, 89, 0.10)';
    }
    return 'rgba(99, 102, 241, 0.10)';
}

export function collapseButtonStyle(collapsed: boolean) {
    return {
        border: '1px solid var(--border-subtle)',
        background: collapsed ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-full)',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: 'var(--shadow-xs)',
    } as const;
}

export function collapsedBodyStyle(color: string, fontSize: string) {
    return {
        color: 'var(--text-secondary)',
        fontSize,
        lineHeight: 1.7,
        marginTop: '16px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-secondary)',
        border: `1px dashed ${color}`,
    } as const;
}

export function bodyHeaderStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        marginTop: '6px',
    } as const;
}

export function bodyMetaGroupStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
    } as const;
}

export function bodyControlsStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
    } as const;
}

export function bodyHintStyle() {
    return {
        fontSize: '12px',
        color: 'var(--text-muted)',
        fontWeight: 500,
    } as const;
}

export function formatRoleLabel(role: string | undefined): string {
    if (!role) return '辩手';
    return role
        .split(/[_-\s]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

function getRoleBadge(text: string): string {
    const badge = text
        .split(/[_-\s]+/)
        .filter(Boolean)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2);
    return badge || '辩';
}

function hashRole(role: string): number {
    let hash = 0;
    for (const char of role) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash;
}

export function getAgentVisual(agentEntry?: DialogueEntry | null): RoleVisual {
    const role = agentEntry?.role ?? '';
    const rawLabel = agentEntry?.agent_name?.trim();
    const label = rawLabel && rawLabel !== role ? rawLabel : formatRoleLabel(role);
    const knownVisual = role ? KNOWN_ROLE_VISUALS[role] : undefined;

    if (knownVisual) {
        return {
            ...knownVisual,
            label: label || knownVisual.label,
        };
    }

    const palette = EXTRA_ROLE_VISUALS[hashRole(role || label) % EXTRA_ROLE_VISUALS.length];
    return {
        badge: getRoleBadge(label || role),
        label: label || '辩手',
        ...palette,
    };
}

export function getJudgeVisual(judgeEntry?: DialogueEntry | null): JudgeVisual {
    if (judgeEntry?.role === 'sophistry_round_report') {
        return {
            badge: '观',
            label: judgeEntry.agent_name || '观察报告',
            color: 'var(--mode-sophistry-accent)',
            background: 'var(--mode-sophistry-card)',
            border: 'var(--mode-sophistry-border)',
            glowTint: 'rgba(184, 137, 70, 0.28)',
        };
    }

    if (judgeEntry?.role === 'sophistry_final_report') {
        return {
            badge: '总',
            label: judgeEntry.agent_name || '实验总览',
            color: 'var(--mode-sophistry-accent)',
            background: 'linear-gradient(180deg, var(--mode-sophistry-card), rgba(255, 248, 238, 0.95))',
            border: 'var(--mode-sophistry-border)',
            glowTint: 'rgba(184, 137, 70, 0.34)',
        };
    }

    return {
        badge: '裁',
        label: judgeEntry?.agent_name || '裁判评分',
        color: 'var(--color-judge)',
        background: 'var(--bg-secondary)',
        border: 'var(--border-subtle)',
        glowTint: 'rgba(148, 163, 184, 0.25)',
    };
}
