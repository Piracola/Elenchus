import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { DialogueEntry } from '../../types';
import MessageRow from './MessageRow';

function makeEntry(overrides: Partial<DialogueEntry>): DialogueEntry {
    return {
        role: 'proposer',
        agent_name: 'Proposer',
        content: 'Example speech',
        citations: [],
        timestamp: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

describe('MessageRow', () => {
    it('renders additional participants without falling back to opposer labels', () => {
        const markup = renderToStaticMarkup(
            <MessageRow
                agentEntry={makeEntry({
                    role: 'challenger',
                    agent_name: 'Challenger',
                })}
            />,
        );

        expect(markup).toContain('Challenger');
        expect(markup).toContain('>C<');
        expect(markup).not.toContain('Opposer');
        expect(markup).not.toContain('反方');
    });

    it('formats raw role names into readable labels', () => {
        const markup = renderToStaticMarkup(
            <MessageRow
                agentEntry={makeEntry({
                    role: 'proposer',
                    agent_name: 'proposer',
                })}
            />,
        );

        expect(markup).toContain('Proposer');
        expect(markup).not.toContain('&gt;proposer&lt;');
    });

    it('renders agent content immediately without typewriter buffering', () => {
        render(
            <MessageRow
                agentEntry={makeEntry({
                    content: 'Immediate example',
                })}
            />,
        );

        const visibleContent = document.querySelector('[data-agent-content="visible"]');
        expect(screen.getByText('Immediate example')).toBeInTheDocument();
        expect(visibleContent?.textContent).toContain('Immediate example');
        expect(document.querySelector('[data-agent-content="reserve"]')).toBeNull();
    });

    it('collapses leading think blocks by default while keeping the final answer visible', () => {
        render(
            <MessageRow
                agentEntry={makeEntry({
                    content: '<think>private reasoning</think>\n\nPublic answer',
                })}
            />,
        );

        expect(screen.getByText('Public answer')).toBeInTheDocument();
        expect(screen.getByText('\u9ed8\u8ba4\u5df2\u6298\u53e0')).toBeInTheDocument();
        expect(screen.queryByText('private reasoning')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '\u5c55\u5f00\u601d\u7ef4\u94fe' }));

        expect(screen.getByText('private reasoning')).toBeInTheDocument();
    });

    it('renders sophistry observer reports without the score grid', () => {
        const markup = renderToStaticMarkup(
            <MessageRow
                judgeEntry={makeEntry({
                    role: 'sophistry_round_report',
                    agent_name: '观察报告',
                    content: 'Detected a false dichotomy.',
                })}
            />,
        );

        expect(markup).toContain('观察报告');
        expect(markup).toContain('Detected a false dichotomy.');
        expect(markup).not.toContain('裁判评分表');
    });
});
