import { motion } from 'framer-motion';
import { AlertTriangle, Layers, Scale, ShieldCheck, Telescope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ENTER_UP, TRANSITION } from '../../../config/motion';
import { SCORE_DIMENSIONS, SCORE_MODULES } from '../../../types';
import type { DialogueEntry, ScoreDimensionKey, ScoreModuleKey, TurnScore } from '../../../types';
import { DIMENSION_WEIGHT_MAP, MODULE_DIMENSIONS, STATIC_MOTION_PROPS } from './shared';

/** Line icons instead of emoji: emoji render per-platform and read as toys. */
const MODULE_ICONS: Record<ScoreModuleKey, LucideIcon> = {
    foundation: Layers,
    confrontation: Scale,
    stability: ShieldCheck,
    vision: Telescope,
};

function formatScoreValue(score: number): string {
    const rounded = Math.round(score * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getDimensionScore(scores: TurnScore, key: ScoreDimensionKey): number | null {
    const scoreValue = scores[key]?.score;
    if (typeof scoreValue === 'number') {
        return scoreValue;
    }

    const legacyPersuasiveness = scores.persuasiveness?.score;
    if (key === 'boundary_contribution' && typeof legacyPersuasiveness === 'number') {
        return legacyPersuasiveness;
    }

    return null;
}

function getWeightedAverage(scores: TurnScore, dimensions: ScoreDimensionKey[]): number | null {
    const availableDimensions = dimensions.filter((dimension) => getDimensionScore(scores, dimension) !== null);
    if (availableDimensions.length === 0) {
        return null;
    }

    const totalWeight = availableDimensions.reduce(
        (sum, dimension) => sum + DIMENSION_WEIGHT_MAP[dimension],
        0,
    );
    const weightedSum = availableDimensions.reduce((sum, dimension) => {
        const scoreValue = getDimensionScore(scores, dimension);
        return sum + (scoreValue ?? 0) * DIMENSION_WEIGHT_MAP[dimension];
    }, 0);

    return Math.round(((weightedSum / totalWeight) + Number.EPSILON) * 10) / 10;
}

function getComprehensiveScore(scores: TurnScore): number | null {
    if (typeof scores.comprehensive_score === 'number') {
        return Math.round((scores.comprehensive_score + Number.EPSILON) * 10) / 10;
    }
    return getWeightedAverage(
        scores,
        SCORE_DIMENSIONS.map((dimension) => dimension.key),
    );
}

function getModuleScore(scores: TurnScore, moduleKey: ScoreModuleKey): number | null {
    const precomputedScore = scores.module_scores?.[moduleKey];
    if (typeof precomputedScore === 'number') {
        return Math.round((precomputedScore + Number.EPSILON) * 10) / 10;
    }
    return getWeightedAverage(scores, MODULE_DIMENSIONS[moduleKey]);
}

type ScoreGridProps = {
    judgeEntry: DialogueEntry;
    animated: boolean;
};

export function ScoreGrid({ judgeEntry, animated }: ScoreGridProps) {
    if (judgeEntry.role !== 'judge' || !judgeEntry.scores || Object.keys(judgeEntry.scores).length === 0) {
        return null;
    }

    const comprehensiveScore = getComprehensiveScore(judgeEntry.scores);
    const moduleCards = SCORE_MODULES.map((module) => ({
        ...module,
        score: getModuleScore(judgeEntry.scores as TurnScore, module.key),
    })).filter((module): module is (typeof SCORE_MODULES)[number] & { score: number } => module.score !== null);

    if (comprehensiveScore === null && moduleCards.length === 0) {
        return null;
    }

    const parseFailed = Boolean((judgeEntry.scores as TurnScore).parse_failed);

    return (
        <motion.div
            {...(animated ? { ...ENTER_UP, transition: TRANSITION.normal } : STATIC_MOTION_PROPS)}
            style={{
                marginTop: 'var(--space-4)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--border-subtle)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                }}
            >
                <span
                    style={{
                        fontSize: 'var(--text-2xs)',
                        color: 'var(--text-muted)',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                    }}
                >
                    概念边界评分
                </span>
                {parseFailed && (
                    <span
                        title="裁判输出未能解析为有效评分，本轮已按中性 5 分记录，不代表真实评估。"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: 'var(--text-2xs)',
                            fontWeight: 600,
                            color: 'var(--accent-rose)',
                        }}
                    >
                        <AlertTriangle size={12} aria-hidden="true" />
                        解析失败·中性分
                    </span>
                )}
            </div>

            {comprehensiveScore !== null && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 'var(--space-3)',
                        marginBottom: 'var(--space-4)',
                    }}
                >
                    <span
                        className="tabular-nums"
                        style={{
                            fontSize: 'var(--text-3xl)',
                            fontWeight: 700,
                            lineHeight: 1,
                            letterSpacing: 'var(--tracking-tight)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        {formatScoreValue(comprehensiveScore)}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>/ 10</span>
                    <span
                        style={{
                            marginLeft: 'auto',
                            fontSize: 'var(--text-2xs)',
                            color: 'var(--text-muted)',
                        }}
                    >
                        加权综合
                    </span>
                </div>
            )}

            {moduleCards.length > 0 && (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {moduleCards.map((module) => {
                        const Icon = MODULE_ICONS[module.key] ?? Layers;
                        return (
                            <div
                                key={module.key}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'auto 1fr auto',
                                    alignItems: 'center',
                                    gap: 'var(--space-3)',
                                }}
                            >
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--text-secondary)',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <Icon size={13} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
                                    {module.label}
                                    <span style={{ color: 'var(--text-faint)' }}>{module.weight}%</span>
                                </span>

                                {/* A rule whose filled portion encodes the score keeps the
                                    readout monochrome while still being scannable. */}
                                <span
                                    aria-hidden="true"
                                    style={{
                                        position: 'relative',
                                        height: '2px',
                                        borderRadius: 'var(--radius-full)',
                                        background: 'var(--border-subtle)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <span
                                        style={{
                                            position: 'absolute',
                                            inset: '0 auto 0 0',
                                            width: `${Math.max(0, Math.min(100, module.score * 10))}%`,
                                            background: 'var(--text-secondary)',
                                        }}
                                    />
                                </span>

                                <span
                                    className="tabular-nums"
                                    style={{
                                        fontSize: 'var(--text-sm)',
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        minWidth: '2.4em',
                                        textAlign: 'right',
                                    }}
                                >
                                    {formatScoreValue(module.score)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
}
