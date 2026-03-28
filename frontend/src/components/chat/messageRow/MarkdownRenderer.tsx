import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessageMarkdownProps = {
    text: string;
};

export function MessageMarkdown({ text }: MessageMarkdownProps) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
        </ReactMarkdown>
    );
}
