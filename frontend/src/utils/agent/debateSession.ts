export const DEFAULT_MAX_TURNS = 5;
export const DEFAULT_TEAM_AGENTS_PER_TEAM = 0;
export const DEFAULT_TEAM_DISCUSSION_ROUNDS = 0;
export const DEFAULT_JURY_AGENTS_PER_JURY = 0;
export const DEFAULT_JURY_DISCUSSION_ROUNDS = 0;

function parseBoundedIntegerInput(
    input: string,
    options: {
        fallback: number;
        min: number;
        max: number;
    },
): number {
    const { fallback, min, max } = options;
    const trimmed = input.trim();
    if (!trimmed) {
        return fallback;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return fallback;
    }

    return parsed;
}

export function parseMaxTurnsInput(
    input: string,
    fallback: number = DEFAULT_MAX_TURNS,
): number {
    return parseBoundedIntegerInput(input, {
        fallback,
        min: 1,
        max: 100,
    });
}

export function parseTeamAgentsInput(
    input: string,
    fallback: number = DEFAULT_TEAM_AGENTS_PER_TEAM,
): number {
    return parseBoundedIntegerInput(input, {
        fallback,
        min: 0,
        max: 10,
    });
}

export function parseTeamDiscussionRoundsInput(
    input: string,
    fallback: number = DEFAULT_TEAM_DISCUSSION_ROUNDS,
): number {
    return parseBoundedIntegerInput(input, {
        fallback,
        min: 0,
        max: 10,
    });
}

export function parseJuryAgentsInput(
    input: string,
    fallback: number = DEFAULT_JURY_AGENTS_PER_JURY,
): number {
    return parseBoundedIntegerInput(input, {
        fallback,
        min: 0,
        max: 10,
    });
}

export function parseJuryDiscussionRoundsInput(
    input: string,
    fallback: number = DEFAULT_JURY_DISCUSSION_ROUNDS,
): number {
    return parseBoundedIntegerInput(input, {
        fallback,
        min: 0,
        max: 10,
    });
}
