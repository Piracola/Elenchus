export interface ThinkingContentParts {
    thinking: string | null;
    response: string;
}

const LEADING_WHITESPACE_REGEX = /^\s*/;
const THINK_OPEN_TAG_REGEX = /^<think\b[^>]*>/i;
const THINK_CLOSE_TAG_REGEX = /<\/think\s*>/i;
const LEADING_LINE_BREAKS_REGEX = /^(?:[ \t]*\r?\n)+/;
const LEADING_INLINE_SPACES_REGEX = /^[ \t]+/;
const TRAILING_LINE_BREAKS_REGEX = /(?:\r?\n[ \t]*)+$/;

function normalizeThinkingSegment(value: string): string {
    return value
        .replace(LEADING_LINE_BREAKS_REGEX, '')
        .replace(TRAILING_LINE_BREAKS_REGEX, '');
}

function stripResponsePadding(value: string): string {
    const withoutLeadingBreaks = value.replace(LEADING_LINE_BREAKS_REGEX, '');
    if (withoutLeadingBreaks !== value) {
        return withoutLeadingBreaks;
    }
    return value.replace(LEADING_INLINE_SPACES_REGEX, '');
}

export function splitLeadingThinkingContent(content: string): ThinkingContentParts {
    if (!content) {
        return {
            thinking: null,
            response: '',
        };
    }

    let cursor = 0;
    const thinkingSegments: string[] = [];

    while (cursor < content.length) {
        const leadingWhitespace = LEADING_WHITESPACE_REGEX.exec(content.slice(cursor))?.[0] ?? '';
        const openTagStart = cursor + leadingWhitespace.length;
        const remaining = content.slice(openTagStart);
        const openTagMatch = THINK_OPEN_TAG_REGEX.exec(remaining);

        if (!openTagMatch) {
            break;
        }

        const afterOpenTag = openTagStart + openTagMatch[0].length;
        const closeTagMatch = THINK_CLOSE_TAG_REGEX.exec(content.slice(afterOpenTag));

        if (!closeTagMatch) {
            return {
                thinking: null,
                response: content,
            };
        }

        const segment = normalizeThinkingSegment(
            content.slice(afterOpenTag, afterOpenTag + closeTagMatch.index),
        );

        if (segment) {
            thinkingSegments.push(segment);
        }

        cursor = afterOpenTag + closeTagMatch.index + closeTagMatch[0].length;
    }

    if (cursor === 0) {
        return {
            thinking: null,
            response: content,
        };
    }

    return {
        thinking: thinkingSegments.length ? thinkingSegments.join('\n\n') : null,
        response: stripResponsePadding(content.slice(cursor)),
    };
}
