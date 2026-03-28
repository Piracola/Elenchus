export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export const DISPLAY_FONT_SIZE_IDS = ['small', 'default', 'large', 'extraLarge', 'huge'] as const;
export type DisplayFontSize = typeof DISPLAY_FONT_SIZE_IDS[number];

export interface DisplaySettings {
    messageWidth: 'narrow' | 'medium' | 'wide' | 'full';
    fontSize: DisplayFontSize;
}

export const MARKDOWN_EXPORT_CATEGORY_IDS = [
    'debater_speeches',
    'group_discussion',
    'judge_messages',
    'jury_messages',
    'consensus_summary',
] as const;
export type MarkdownExportCategory = typeof MARKDOWN_EXPORT_CATEGORY_IDS[number];
