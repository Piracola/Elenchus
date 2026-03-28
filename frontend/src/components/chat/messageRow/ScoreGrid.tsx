import { motion } from 'framer-motion';
import { SCORE_DIMENSIONS, SCORE_MODULES } from '../../../types';
import type { DialogueEntry, ScoreDimensionKey, ScoreModuleKey, TurnScore } from '../../../types';
import { DIMENSION_WEIGHT_MAP, MODULE_DIMENSIONS, STATIC_MOTION_PROPS } from './shared';

function formatScoreValue(score: number): string {
    const rounded = Math.round(score * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getDimensionScore(scores: TurnScore, key: ScoreDimensionKey): number | null {
    const scoreValue = scores[key]?.score;
    return typeof scoreValue === 'number' ? scoreValue : null;
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

    return (
        <motion.div
            {...(animated
                ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.2 } }
                : STATIC_MOTION_PROPS)}
            style={{
                marginTop: '20px',
                padding: '20px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-inner)',
            }}
        >
            <div
                style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginBottom: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}
            >
                裁判评分表
            </div>
            {comprehensiveScore !== null && (
                <motion.div
                    {...(animated ? { whileHover: { scale: 1.01 } } : STATIC_MOTION_PROPS)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.14) 0%, rgba(255, 149, 0, 0.04) 100%)',
                        border: '1px solid rgba(255, 149, 0, 0.18)',
                        padding: '16px',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-xs)',
                        marginBottom: '12px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                        }}
                    >
                        <span>综合评分</span>
                        <span
                            style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: 'rgba(255, 149, 0, 0.12)',
                                color: 'var(--color-judge)',
                                fontWeight: 600,
                            }}
                        >
                            加权汇总
                        </span>
                    </div>
                    <div
                        style={{
                            fontSize: '30px',
                            fontWeight: 800,
                            color: 'var(--color-judge)',
                            lineHeight: 1,
                        }}
                    >
                        {formatScoreValue(comprehensiveScore)}
                        <span
                            style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                                marginLeft: '4px',
                            }}
                        >
                            /10
                        </span>
                    </div>
                </motion.div>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '10px',
                }}
            >
                {moduleCards.map((module) => (
                    <motion.div
                        key={module.key}
                        {...(animated ? { whileHover: { scale: 1.02 } } : STATIC_MOTION_PROPS)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            background: 'var(--bg-card)',
                            padding: '14px',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-xs)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                <span>{module.icon}</span>
                                {module.label}
                            </div>
                            <span
                                style={{
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    padding: '3px 7px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'var(--bg-tertiary)',
                                }}
                            >
                                {module.weight}%
                            </span>
                        </div>
                        <div
                            style={{
                                fontSize: '22px',
                                fontWeight: 700,
                                color: 'var(--color-judge)',
                            }}
                        >
                            {formatScoreValue(module.score)}
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: 'var(--text-muted)',
                                    fontWeight: 400,
                                    marginLeft: '2px',
                                }}
                            >
                                /10
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
