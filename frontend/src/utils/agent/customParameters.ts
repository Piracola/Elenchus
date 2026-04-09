export function formatCustomParameters(
    value: Record<string, unknown> | null | undefined,
): string {
    if (!value || Object.keys(value).length === 0) {
        return '';
    }
    return JSON.stringify(value, null, 2);
}

export function parseCustomParametersInput(input: string): Record<string, unknown> {
    const trimmed = input.trim();
    if (!trimmed) {
        return {};
    }

    const wrapped = trimmed.startsWith('{') ? trimmed : `{\n${trimmed}\n}`;
    const normalized = wrapped.replace(/,\s*}/g, '}');
    const parsed = JSON.parse(normalized) as unknown;

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('原始参数必须是 JSON 对象。');
    }

    return parsed as Record<string, unknown>;
}
