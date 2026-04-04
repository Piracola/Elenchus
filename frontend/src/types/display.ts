export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface DisplaySettings {
    messageWidth: 'narrow' | 'medium' | 'wide' | 'full';
    /** Message interface font size (in px), user-configurable */
    messageFontSize?: number;
    /** Settings panel font size (in px), independent from message font size */
    settingsFontSize?: number;
}

export const MARKDOWN_EXPORT_CATEGORY_IDS = [
    'debater_speeches',
    'group_discussion',
    'judge_messages',
    'jury_messages',
    'consensus_summary',
] as const;
export type MarkdownExportCategory = typeof MARKDOWN_EXPORT_CATEGORY_IDS[number];
