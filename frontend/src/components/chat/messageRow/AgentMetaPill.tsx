type AgentMetaPillProps = {
    label: string;
    color: string;
    background: string;
};

export function AgentMetaPill({ label, color, background }: AgentMetaPillProps) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 600,
                color,
                background,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
}
