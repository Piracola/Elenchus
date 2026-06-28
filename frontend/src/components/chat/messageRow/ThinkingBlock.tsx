import { useState } from 'react';
import { MessageMarkdown } from './MarkdownRenderer';
import { markdownBodyStyle } from './contentStyles';

const THINKING_PANEL_LABEL = '\u601d\u7ef4\u94fe';
const THINKING_PANEL_SHOW = '\u5c55\u5f00';
const THINKING_PANEL_HIDE = '\u6298\u53e0';
const THINKING_PANEL_HINT = '\u9ed8\u8ba4\u5df2\u6298\u53e0';
const THINKING_PANEL_SHOW_TITLE = '\u5c55\u5f00\u601d\u7ef4\u94fe';
const THINKING_PANEL_HIDE_TITLE = '\u6298\u53e0\u601d\u7ef4\u94fe';

function thinkingPanelStyle(accentColor: string) {
    return {
        background: 'color-mix(in srgb, var(--bg-tertiary) 54%, transparent)',
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
    } as const;
}

function thinkingHeaderStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        minHeight: '34px',
        padding: '7px 10px 7px 12px',
    } as const;
}

function thinkingLabelStyle() {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: 0,
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        lineHeight: 1.2,
    } as const;
}

function thinkingToggleStyle(expanded: boolean) {
    return {
        border: 'none',
        background: expanded ? 'var(--bg-hover)' : 'transparent',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 7px',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
    } as const;
}

function thinkingHintStyle() {
    return {
        padding: '0 12px 9px',
        color: 'var(--text-muted)',
        fontSize: '11px',
        lineHeight: 1.45,
    } as const;
}

function thinkingAccentDotStyle(accentColor: string) {
    return {
        width: '6px',
        height: '6px',
        borderRadius: 'var(--radius-full)',
        background: accentColor,
        flexShrink: 0,
    } as const;
}

type ThinkingBlockProps = {
    content: string | null;
    accentColor: string;
    fontSize: string;
    textColor: string;
};

export function ThinkingBlock({
    content,
    accentColor,
    fontSize,
    textColor,
}: ThinkingBlockProps) {
    const [expanded, setExpanded] = useState(false);

    if (!content) {
        return null;
    }

    return (
        <div
            data-thinking-block="true"
            data-thinking-expanded={expanded ? 'true' : 'false'}
            style={thinkingPanelStyle(accentColor)}
        >
            <div style={thinkingHeaderStyle()}>
                <span style={thinkingLabelStyle()}>
                    <span aria-hidden="true" style={thinkingAccentDotStyle(accentColor)} />
                    <span>{THINKING_PANEL_LABEL}</span>
                </span>
                <button
                    type="button"
                    data-thinking-toggle="true"
                    aria-expanded={expanded}
                    aria-label={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    title={expanded ? THINKING_PANEL_HIDE_TITLE : THINKING_PANEL_SHOW_TITLE}
                    onClick={() => setExpanded((current) => !current)}
                    style={thinkingToggleStyle(expanded)}
                >
                    <span>{expanded ? THINKING_PANEL_HIDE : THINKING_PANEL_SHOW}</span>
                </button>
            </div>
            {expanded ? (
                <div
                    className="markdown-body"
                    data-thinking-content="visible"
                    style={{
                        ...markdownBodyStyle(fontSize, textColor),
                        padding: '0 12px 10px',
                        lineHeight: 1.62,
                    }}
                >
                    <MessageMarkdown text={content} />
                </div>
            ) : (
                <div data-thinking-content="collapsed" style={thinkingHintStyle()}>
                    {THINKING_PANEL_HINT}
                </div>
            )}
        </div>
    );
}
