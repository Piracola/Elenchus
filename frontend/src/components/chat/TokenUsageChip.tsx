import { useDebateStore } from '../../stores/debateStore';

function formatTokens(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
    return value.toLocaleString();
}

/**
 * Compact, self-subscribing token counter for the chat header.
 * Hidden until the run has produced at least one usage report.
 */
export default function TokenUsageChip() {
    const tokenUsage = useDebateStore((state) => state.tokenUsage);
    if (!tokenUsage || tokenUsage.total.total_tokens <= 0) {
        return null;
    }
    const { input_tokens, output_tokens, total_tokens, calls } = tokenUsage.total;
    return (
        <span
            title={`输入 ${input_tokens.toLocaleString()} / 输出 ${output_tokens.toLocaleString()} token · ${calls} 次模型调用`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: 600,
                flexShrink: 0,
                cursor: 'default',
            }}
        >
            Token
            <span style={{ color: 'var(--text-primary)' }}>{formatTokens(total_tokens)}</span>
        </span>
    );
}
