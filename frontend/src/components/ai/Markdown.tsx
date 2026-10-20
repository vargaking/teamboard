import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders AI markdown. Links open in a new tab; raw HTML is not rendered (react-markdown default). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`markdown-body${className ? ` ${className}` : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
