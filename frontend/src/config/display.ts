import { DISPLAY_FONT_SIZE_IDS } from '../types';
import type { DisplayFontSize } from '../types';

export const DISPLAY_FONT_SIZE_OPTIONS: {
    value: DisplayFontSize;
    label: string;
    description: string;
}[] = [
    { value: 'small', label: '较小', description: '轻度缩小正文与标题，适合大屏高密度阅读' },
    { value: 'default', label: '默认', description: '保持当前界面密度，适合标准阅读' },
    { value: 'large', label: '较大', description: '正文和首页主要文本增大一级，更易阅读' },
    { value: 'extraLarge', label: '特大', description: '进一步放大正文与标题，适合小窗口阅读' },
    { value: 'huge', label: '超大', description: '最大化主要阅读区字号，适合远距离或高缩放场景' },
];

export const DISPLAY_FONT_SIZE_SET = new Set<DisplayFontSize>(DISPLAY_FONT_SIZE_IDS);

export function normalizeDisplayFontSize(value: unknown): DisplayFontSize {
    return typeof value === 'string' && DISPLAY_FONT_SIZE_SET.has(value as DisplayFontSize)
        ? value as DisplayFontSize
        : 'default';
}

export const DISPLAY_FONT_TOKENS: Record<DisplayFontSize, {
    home: {
        title: string;
        subtitle: string;
        modeDescription: string;
        warningBody: string;
        topicInput: string;
    };
    chat: {
        topicTitle: string;
    };
    message: {
        body: string;
        judgeBody: string;
        judgeBodyCompact: string;
        audienceBody: string;
        systemBody: string;
    };
}> = {
    small: {
        home: {
            title: '34px',
            subtitle: '14px',
            modeDescription: '12px',
            warningBody: '12px',
            topicInput: '15px',
        },
        chat: {
            topicTitle: '14px',
        },
        message: {
            body: '14px',
            judgeBody: '14px',
            judgeBodyCompact: '13px',
            audienceBody: '13px',
            systemBody: '12px',
        },
    },
    default: {
        home: {
            title: '36px',
            subtitle: '15px',
            modeDescription: '13px',
            warningBody: '13px',
            topicInput: '16px',
        },
        chat: {
            topicTitle: '15px',
        },
        message: {
            body: '15px',
            judgeBody: '15px',
            judgeBodyCompact: '14px',
            audienceBody: '14px',
            systemBody: '13px',
        },
    },
    large: {
        home: {
            title: '38px',
            subtitle: '16px',
            modeDescription: '14px',
            warningBody: '14px',
            topicInput: '17px',
        },
        chat: {
            topicTitle: '16px',
        },
        message: {
            body: '16px',
            judgeBody: '16px',
            judgeBodyCompact: '15px',
            audienceBody: '15px',
            systemBody: '14px',
        },
    },
    extraLarge: {
        home: {
            title: '40px',
            subtitle: '17px',
            modeDescription: '15px',
            warningBody: '15px',
            topicInput: '18px',
        },
        chat: {
            topicTitle: '17px',
        },
        message: {
            body: '17px',
            judgeBody: '17px',
            judgeBodyCompact: '16px',
            audienceBody: '16px',
            systemBody: '15px',
        },
    },
    huge: {
        home: {
            title: '42px',
            subtitle: '18px',
            modeDescription: '16px',
            warningBody: '16px',
            topicInput: '19px',
        },
        chat: {
            topicTitle: '18px',
        },
        message: {
            body: '18px',
            judgeBody: '18px',
            judgeBodyCompact: '17px',
            audienceBody: '17px',
            systemBody: '16px',
        },
    },
};
