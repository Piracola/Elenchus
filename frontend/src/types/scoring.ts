export interface DimensionScore {
    score: number;
    rationale: string;
}

export type ScoreDimensionKey =
    | 'logical_rigor'
    | 'evidence_quality'
    | 'topic_focus'
    | 'rebuttal_strength'
    | 'consistency'
    | 'persuasiveness';

export type ScoreModuleKey = 'foundation' | 'confrontation' | 'stability' | 'vision';

export interface TurnScore {
    logical_rigor: DimensionScore;
    evidence_quality: DimensionScore;
    topic_focus: DimensionScore;
    rebuttal_strength: DimensionScore;
    consistency: DimensionScore;
    persuasiveness: DimensionScore;
    module_scores?: Partial<Record<ScoreModuleKey, number>>;
    comprehensive_score?: number;
    overall_comment: string;
}

export const SCORE_DIMENSIONS: {
    key: ScoreDimensionKey;
    label: string;
    icon: string;
    max: number;
    weight: number;
}[] = [
    { key: 'evidence_quality', label: '证据质量', icon: '📚', max: 10, weight: 15 },
    { key: 'topic_focus', label: '切题度与定义稳定', icon: '🎯', max: 10, weight: 15 },
    { key: 'logical_rigor', label: '逻辑严密度', icon: '🧠', max: 10, weight: 20 },
    { key: 'rebuttal_strength', label: '反驳力度', icon: '🛡️', max: 10, weight: 20 },
    { key: 'consistency', label: '前后一致', icon: '🔗', max: 10, weight: 15 },
    { key: 'persuasiveness', label: '价值立意与说服力', icon: '✨', max: 10, weight: 15 },
];

export const SCORE_MODULES: {
    key: ScoreModuleKey;
    label: string;
    icon: string;
    weight: number;
}[] = [
    { key: 'foundation', label: '基础建构', icon: '🏗️', weight: 30 },
    { key: 'confrontation', label: '对抗推演', icon: '⚔️', weight: 40 },
    { key: 'stability', label: '系统稳定', icon: '🧩', weight: 15 },
    { key: 'vision', label: '终局视野', icon: '🔭', weight: 15 },
];
