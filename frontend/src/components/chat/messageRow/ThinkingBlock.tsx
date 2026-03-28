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
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
    } as const;
}

function thinkingHeaderStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '12px 16px',
    } as const;
}

function thinkingLabelStyle(accentColor: string) {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 700,
        color: accentColor,
    } as const;
}

function thinkingToggleStyle(expanded: boolean) {
    return {
        border: '1px solid var(--border-subtle)',
        background: expanded ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-full)',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: 'var(--shadow-xs)',
        flexShrink: 0,
    } as const;
}

function thinkingHintStyle() {
    return {
        padding: '0 16px 16px',
        color: 'var(--text-muted)',
        fontSize: '12px',
        lineHeight: 1.6,
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
                <span style={thinkingLabelStyle(accentColor)}>
                    <span aria-hidden="true">{expanded ? '-' : '+'}</span>
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
                        padding: '0 16px 16px',
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
