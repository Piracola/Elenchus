import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DialogueEntry } from '../../types';
import RoundInsights, { type InsightSection } from './RoundInsights';

afterEach(() => {
    cleanup();
});

function entry(overrides: Partial<DialogueEntry> = {}): DialogueEntry {
    return {
        role: 'consensus_summary',
        agent_name: '共识收敛员',
        content: '这是一段很长的共识正文',
        citations: [],
        timestamp: '2026-03-17T00:00:00Z',
        ...overrides,
    };
}

function section(overrides: Partial<InsightSection> = {}): InsightSection {
    return {
        key: 'team-0-proposer',
        title: '共识收敛',
        accent: 'var(--color-proposer)',
        entries: [entry()],
        ...overrides,
    };
}

describe('RoundInsights', () => {
    it('keeps insight content collapsed until the header is clicked', () => {
        render(<RoundInsights sections={[section()]} />);

        expect(screen.getByText('共识收敛')).toBeInTheDocument();
        expect(screen.queryByText('这是一段很长的共识正文')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /共识收敛/ }));

        expect(screen.getByText('这是一段很长的共识正文')).toBeInTheDocument();
    });

    it('shows loading status while collapsed', () => {
        render(<RoundInsights sections={[section({ loadingLabel: '正在生成...' })]} />);

        expect(screen.getByText('正在生成...')).toBeInTheDocument();
        expect(screen.queryByText('这是一段很长的共识正文')).not.toBeInTheDocument();
    });
});
