/**
 * StreamingMessage - renders real-time streaming text from speech_token events.
 *
 * Performance strategy:
 * 1. Receive the already-derived live speech entry from the transcript view model
 * 2. Use requestAnimationFrame to throttle React re-renders to max once per frame (~60fps)
 * 3. Use a ref to track content changes without triggering re-renders
 * 4. setRenderedContent with functional update skips re-render if content hasn't changed
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { DialogueEntry } from '../../types';
import { getAgentVisual, STATIC_MOTION_PROPS } from './messageRow/shared';
import { messageContentWrapperStyle, markdownBodyStyle } from './messageRow/contentStyles';
import { MessageMarkdown } from './messageRow/MarkdownRenderer';
import { ThinkingBlock } from './messageRow/ThinkingBlock';
import { splitLeadingThinkingContent } from '../../utils/chat/thinkingContent';
import { getMessageFontTokens } from '../../config/display';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDebateStore } from '../../stores/debateStore';
import { sanitizeIncomingContent } from '../../utils/agent/debateStoreHelpers';

type StreamingMessageProps = {
    entry: DialogueEntry;
    content: string;
    status: string;
    /**
     * When true the live text is read from the store here instead of being
     * threaded through the transcript view model, so an incoming token
     * re-renders only this component.
     */
    subscribeToStreamingContent?: boolean;
};

export default function StreamingMessage({
    entry,
    content: contentProp,
    status,
    subscribeToStreamingContent = false,
}: StreamingMessageProps) {
    const reducedMotion = useReducedMotion();
    const rafRef = useRef<number | null>(null);
    const isStreamingRef = useRef(false);
    const [renderedContent, setRenderedContent] = useState('');
    // isStreaming state tracked via isStreamingRef for performance
    const [, setIsStreaming] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const messageFontSize = useSettingsStore((state) => state.displaySettings.messageFontSize ?? 15);
    const messageFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).message, [messageFontSize]);
    const storeStreamingContent = useDebateStore((state) => state.streamingContent);
    const content = useMemo(
        () => (subscribeToStreamingContent ? sanitizeIncomingContent(storeStreamingContent) : contentProp),
        [subscribeToStreamingContent, storeStreamingContent, contentProp],
    );

    // Use a ref to track the latest content without triggering re-render
    const latestContentRef = useRef('');

    // Update the ref immediately (no re-render)
    useEffect(() => {
        latestContentRef.current = content;
    }, [content]);

    // Handle streaming lifecycle (start/end detection)
    useEffect(() => {
        if (entry.role && !isStreamingRef.current) {
            // Streaming started
            isStreamingRef.current = true;
            setIsStreaming(true);
            setRenderedContent(content);
            latestContentRef.current = content;
        } else if (!entry.role && isStreamingRef.current) {
            // Streaming ended
            isStreamingRef.current = false;
            setIsStreaming(false);
            setRenderedContent('');
            latestContentRef.current = '';
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        }
    }, [content, entry.role]);

    // RAF-throttled content update: schedules at most one re-render per frame
    useEffect(() => {
        if (!isStreamingRef.current) return;

        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                const content = latestContentRef.current;
                // Functional update: React skips re-render if prev === next
                setRenderedContent((prev) => (prev === content ? prev : content));
            });
        }
    }, [content]);

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    // Build a fake DialogueEntry for getAgentVisual
    const agentVisual = useMemo(() => {
        if (!entry.role) return null;
        return getAgentVisual(entry);
    }, [entry]);

    const badgeBg = agentVisual?.color ?? 'var(--accent-indigo)';
    const streamingStatus = status || '正在发言...';

    const splitContent = useMemo(
        () => splitLeadingThinkingContent(renderedContent),
        [renderedContent],
    );

    // Auto-scroll to bottom when content updates
    useEffect(() => {
        if (!renderedContent || !scrollRef.current) return;

        // We scroll the parent chat list, not this component's own div
        // Find the scrollable container (ChatHistoryList's scroll ref)
        const container = scrollRef.current.closest('[style*="overflow-y"]') ||
                          scrollRef.current.parentElement;
        if (!container) return;

        const scrollEl = container as HTMLElement;
        const isNearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 300;
        if (isNearBottom) {
            scrollEl.scrollTo({
                top: scrollEl.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [renderedContent]);

    if (!entry.role || !agentVisual) return null;

    return (
        <div
            ref={scrollRef}
            aria-busy="true"
            // Deliberately not a live region: a token-by-token announcement would
            // restart the utterance dozens of times per speech. StatusBanner
            // announces that a speech is being generated; the text itself is read
            // by navigating the transcript once it settles.
            aria-live="off"
            // Mirrors MessageRow's row geometry: same speech column, same
            // reserved verdict column, so a speech does not resize or shift when
            // it stops streaming and becomes a settled row.
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-5)',
                width: '100%',
                alignItems: 'flex-start',
                marginBottom: 'var(--space-8)',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 var(--transcript-speech-min)', minWidth: 0 }}>
                <motion.div
                    {...STATIC_MOTION_PROPS}
                    style={{
                        position: 'relative',
                        background: 'var(--surface)',
                        padding: 'var(--space-4) var(--space-6) var(--space-5)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-hairline)',
                        boxShadow: 'none',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '9px',
                            marginBottom: '10px',
                            minWidth: 0,
                            flexWrap: 'wrap',
                        }}
                    >
                        <div
                            style={{
                                width: '32px',
                                height: '32px',
                                background: badgeBg,
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 'var(--text-sm)',
                                flexShrink: 0,
                            }}
                        >
                            {agentVisual.badge}
                        </div>
                        <span
                            style={{
                                fontSize: '13px',
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {agentVisual.label}
                        </span>

                        {/* Streaming indicator dot */}
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: 'var(--accent-emerald)',
                                fontWeight: 600,
                            }}
                        >
                            <span
                                style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-emerald)',
                                    animation: reducedMotion ? 'none' : 'pulse 1s ease-in-out infinite',
                                }}
                            />
                            {streamingStatus}
                        </span>
                    </div>

                    {/* Content body */}
                    <div style={messageContentWrapperStyle('10px')}>
                        <ThinkingBlock
                            content={splitContent.thinking}
                            accentColor={badgeBg}
                            fontSize={messageFontSizes.body}
                            textColor="var(--text-primary)"
                        />
                        {splitContent.response && (
                            <div
                                className="markdown-body"
                                style={markdownBodyStyle(messageFontSizes.body, 'var(--text-primary)')}
                            >
                                <MessageMarkdown text={splitContent.response} />
                            </div>
                        )}
                        {!splitContent.response && !splitContent.thinking && (
                            <span
                                style={{
                                    fontSize: messageFontSizes.body,
                                    color: 'var(--text-muted)',
                                }}
                            >
                                {streamingStatus}
                            </span>
                        )}
                    </div>
                </motion.div>
            </div>
            {/* Holds the verdict column open while the speech streams. */}
            <div style={{ flex: '0 1 var(--transcript-verdict-column)', minWidth: 0 }} />
        </div>
    );
}
