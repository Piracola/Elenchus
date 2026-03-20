import { act, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders additional participants without falling back to opposer labels', () => {
        const markup = renderToStaticMarkup(
            <MessageRow
                agentEntry={makeEntry({
                    role: 'challenger',
                    agent_name: 'Challenger',
                })}
            />
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
            />
        );

        expect(markup).toContain('Proposer');
        expect(markup).not.toContain('&gt;proposer&lt;');
    });

    it('reveals live agent content progressively when typewriter animation is enabled', () => {
        vi.useFakeTimers();
        render(
            <MessageRow
                agentEntry={makeEntry({
                    content: 'Typewriter example',
                })}
                animateAgentContent
            />,
        );

        const visibleContent = document.querySelector('[data-agent-content="visible"]');
        expect(visibleContent?.textContent).not.toContain('Typewriter example');

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByText('Typewriter example')).toBeInTheDocument();
        expect(visibleContent?.textContent).toContain('Typewriter example');
    });
});
