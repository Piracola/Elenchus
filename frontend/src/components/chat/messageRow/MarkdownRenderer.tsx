import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CHAT_MARKDOWN_ALLOWED_ELEMENTS = [
    'a',
    'blockquote',
    'br',
    'code',
    'del',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'img',
    'input',
    'li',
    'ol',
    'p',
    'pre',
    'section',
    'strong',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
] as const;
const CHAT_MARKDOWN_REMARK_PLUGINS = [remarkGfm];

function shouldOpenInNewTab(href: string): boolean {
    if (href.startsWith('#')) {
        return false;
    }

    const baseUrl = new URL(
        typeof window === 'undefined' ? 'http://localhost/' : window.location.href,
    );

    try {
        const targetUrl = new URL(href, baseUrl);
        return /^https?:$/i.test(targetUrl.protocol) && targetUrl.origin !== baseUrl.origin;
    } catch {
        return false;
    }
}

const markdownComponents: Components = {
    a({ href, children, ...props }) {
        const safeHref = href?.trim() ? href : undefined;
        if (!safeHref) {
            return <span>{children}</span>;
        }

        const openInNewTab = shouldOpenInNewTab(safeHref);

        return (
            <a
                {...props}
                href={safeHref}
                target={openInNewTab ? '_blank' : undefined}
                rel={openInNewTab ? 'noreferrer noopener' : undefined}
            >
                {children}
            </a>
        );
    },
};

type MarkdownRendererProps = {
    text: string;
};

// Memoized: streaming re-renders this on every frame, and re-parsing the
// markdown each time defeats the caller's rAF throttling.
export const MarkdownRenderer = memo(function MarkdownRenderer({ text }: MarkdownRendererProps) {
    return (
        <ReactMarkdown
            remarkPlugins={CHAT_MARKDOWN_REMARK_PLUGINS}
            allowedElements={CHAT_MARKDOWN_ALLOWED_ELEMENTS}
            skipHtml
            unwrapDisallowed
            urlTransform={defaultUrlTransform}
            components={markdownComponents}
        >
            {text}
        </ReactMarkdown>
    );
});

export const MessageMarkdown = MarkdownRenderer;
