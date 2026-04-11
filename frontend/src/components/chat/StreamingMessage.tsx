/**
 * StreamingMessage - renders real-time streaming text from speech_token events.
 *
 * Performance strategy:
 * 1. Subscribe to streamingRole and streamingContent from store via Zustand selectors
 * 2. Use requestAnimationFrame to throttle React re-renders to max once per frame (~60fps)
 * 3. Use a ref to track content changes without triggering re-renders
 * 4. setRenderedContent with functional update skips re-render if content hasn't changed
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDebateStore } from '../../stores/debateStore';
import type { DialogueEntry } from '../../types';
import { getAgentVisual, STATIC_MOTION_PROPS } from './messageRow/shared';
import { messageContentWrapperStyle, markdownBodyStyle } from './messageRow/contentStyles';
import { MessageMarkdown } from './messageRow/MarkdownRenderer';
import { ThinkingBlock } from './messageRow/ThinkingBlock';
import { splitLeadingThinkingContent } from '../../utils/chat/thinkingContent';
import { getMessageFontTokens } from '../../config/display';
import { useSettingsStore } from '../../stores/settingsStore';

export default function StreamingMessage() {
    // Subscribe to store - only re-renders when these specific fields change
    const streamingRole = useDebateStore((state) => state.streamingRole);
    const streamingContent = useDebateStore((state) => state.streamingContent);

    const rafRef = useRef<number | null>(null);
    const isStreamingRef = useRef(false);
    const [renderedContent, setRenderedContent] = useState('');
    // isStreaming state tracked via isStreamingRef for performance
    const [, setIsStreaming] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const messageFontSize = useSettingsStore((state) => state.displaySettings.messageFontSize ?? 15);
    const messageFontSizes = useMemo(() => getMessageFontTokens(messageFontSize).message, [messageFontSize]);

    // Use a ref to track the latest content without triggering re-render
    const latestContentRef = useRef('');

    // Update the ref immediately (no re-render)
    useEffect(() => {
        latestContentRef.current = streamingContent;
    }, [streamingContent]);

    // Handle streaming lifecycle (start/end detection)
    useEffect(() => {
        if (streamingRole && !isStreamingRef.current) {
            // Streaming started
            isStreamingRef.current = true;
            setIsStreaming(true);
            setRenderedContent(streamingContent);
            latestContentRef.current = streamingContent;
        } else if (!streamingRole && isStreamingRef.current) {
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
    }, [streamingRole, streamingContent]);

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
    }, [streamingContent]);

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
        if (!streamingRole) return null;
        return getAgentVisual({
            role: streamingRole,
            agent_name: streamingRole === 'proposer' ? '正方' : streamingRole === 'opposer' ? '反方' : streamingRole,
            content: '',
            citations: [],
            timestamp: '',
        } as DialogueEntry);
    }, [streamingRole]);

    // Determine badge color like MessageRow does
    const isProposer = agentVisual?.label === '正方' || streamingRole === 'proposer';
    const badgeBg = isProposer ? '#22c55e' : '#ef4444';

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

    if (!streamingRole || !agentVisual) return null;

    return (
        <div
            ref={scrollRef}
            style={{
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                gap: '20px',
                marginBottom: '24px',
            }}
        >
            <div style={{ flex: '6 1 0', display: 'flex', flexDirection: 'column' }}>
                <motion.div
                    {...STATIC_MOTION_PROPS}
                    style={{
                        position: 'relative',
                        background: 'var(--bg-card)',
                        padding: '20px 28px 28px 28px',
                        borderRadius: 'var(--radius-xl)',
                        boxShadow: '0 2px 12px rgba(224, 224, 224, 0.5)',
                    }}
                >
                    {/* 统一头部行：头像 + 身份 + 流式指示器 居中对齐 */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            marginBottom: '12px',
                        }}
                    >
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                background: badgeBg,
                                borderRadius: 'var(--radius-md)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '15px',
                                boxShadow: '0 2px 8px rgba(224, 224, 224, 0.6)',
                                flexShrink: 0,
                            }}
                        >
                            {agentVisual.badge}
                        </div>
                        <span
                            style={{
                                fontSize: '13px',
                                color: '#333333',
                                border: '1px solid #CCCCCC',
                                padding: '5px 12px',
                                borderRadius: 'var(--radius-full)',
                                fontWeight: 500,
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
                                    animation: 'pulse 1s ease-in-out infinite',
                                }}
                            />
                            正在发言...
                        </span>
                    </div>

                    {/* Content body */}
                    <div style={messageContentWrapperStyle('16px')}>
                        <ThinkingBlock
                            content={splitContent.thinking}
                            accentColor="#fff"
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
                                正在发言...
                            </span>
                        )}
                    </div>
                </motion.div>
            </div>
            <div style={{ flex: '4 1 0' }} />
        </div>
    );
}
