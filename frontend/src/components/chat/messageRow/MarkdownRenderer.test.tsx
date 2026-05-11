import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
    it('opens external links in a new tab with safe rel attributes', () => {
        render(<MarkdownRenderer text="[OpenAI](https://openai.com)" />);

        const link = screen.getByRole('link', { name: 'OpenAI' });

        expect(link).toHaveAttribute('href', 'https://openai.com');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('keeps same-origin links in the current tab', () => {
        render(<MarkdownRenderer text="[Docs](/docs)" />);

        const link = screen.getByRole('link', { name: 'Docs' });

        expect(link).toHaveAttribute('href', '/docs');
        expect(link).not.toHaveAttribute('target');
        expect(link).not.toHaveAttribute('rel');
    });

    it('drops unsafe urls instead of rendering clickable links', () => {
        render(<MarkdownRenderer text="[Bad](javascript:alert(1))" />);

        expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument();
        expect(screen.getByText('Bad')).toBeInTheDocument();
    });

    it('skips raw html while keeping gfm markdown features', () => {
        const { container } = render(<MarkdownRenderer text={'before <script>alert(1)</script>\n- [x] done'} />);

        expect(container.querySelector('script')).toBeNull();

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();
        expect(checkbox).toBeDisabled();
        expect(screen.getByText('done')).toBeInTheDocument();
        expect(screen.getByText(/^before /)).toBeInTheDocument();
    });
});
