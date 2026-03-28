export function messageContentWrapperStyle(marginTop: string) {
    return {
        marginTop,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    } as const;
}

export function markdownBodyStyle(fontSize: string, color: string) {
    return {
        color,
        fontSize,
        lineHeight: 1.7,
    } as const;
}
