import type { DebateMode } from '../../types';

export type HomeFontSizes = {
    title: string;
    subtitle: string;
    modeDescription: string;
    warningBody: string;
    topicInput: string;
};

export const HOME_MODE_OPTIONS: {
    mode: DebateMode;
    title: string;
    description: string;
}[] = [
    {
        mode: 'standard',
        title: '标准辩论',
        description: '保留裁判、陪审团与常规推理增强，用于更传统的攻防与评分。',
    },
    {
        mode: 'sophistry_experiment',
        title: '诡辩实验模式',
        description: '独立流程，强调诡辩技巧、谬误识别和观察报告，不做评分。',
    },
];
