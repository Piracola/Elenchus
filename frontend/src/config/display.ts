/**
 * Display configuration constants.
 * Message font size is now user-configurable (in px), not preset enum values.
 */

// Default values
export const DEFAULT_MESSAGE_FONT_SIZE = 15;
export const DEFAULT_SETTINGS_FONT_SIZE = 13;

// Font size ranges
export const MESSAGE_FONT_SIZE_MIN = 12;
export const MESSAGE_FONT_SIZE_MAX = 24;
export const SETTINGS_FONT_SIZE_MIN = 10;
export const SETTINGS_FONT_SIZE_MAX = 24;

/**
 * Generate message font tokens based on user's message font size.
 */
export function getMessageFontTokens(messageFontSize: number) {
    const base = messageFontSize;
    
    return {
        home: {
            title: `${base + 21}px`,
            subtitle: `${base}px`,
            modeDescription: `${base - 2}px`,
            warningBody: `${base - 2}px`,
            topicInput: `${base + 1}px`,
        },
        chat: {
            topicTitle: `${base}px`,
        },
        message: {
            body: `${base}px`,
            judgeBody: `${base}px`,
            judgeBodyCompact: `${base - 1}px`,
            audienceBody: `${base - 1}px`,
            systemBody: `${base - 2}px`,
        },
    } as const;
}

/**
 * Backwards compatibility: generate DISPLAY_FONT_TOKENS from a messageFontSize.
 * For new code, use getMessageFontTokens() directly.
 */
export function getDisplayFontTokens(messageFontSize: number) {
    return getMessageFontTokens(messageFontSize);
}

/**
 * Get the effective message font size from display settings.
 * Falls back to default if not set.
 */
export function getMessageFontSize(settings: { messageFontSize?: number }): number {
    return settings.messageFontSize ?? DEFAULT_MESSAGE_FONT_SIZE;
}

/**
 * Get the effective settings font size from display settings.
 * Falls back to default if not set.
 */
export function getSettingsFontSize(settings: { settingsFontSize?: number }): number {
    return settings.settingsFontSize ?? DEFAULT_SETTINGS_FONT_SIZE;
}

/**
 * Validate and clamp a font size value to acceptable range.
 */
export function clampFontSize(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// Keep backwards compatibility export
export const DISPLAY_FONT_TOKENS = getMessageFontTokens(DEFAULT_MESSAGE_FONT_SIZE);
