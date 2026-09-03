import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import userGuideMarkdown from '../../../docs/user-guide.md?raw'
import { Card, BackButton } from './ui'

interface Props {
  onBack: () => void
}

const components: Components = {
  a: ({ href, children, ...props }) => {
    if (href?.startsWith('#')) {
      return <a href={href} {...props}>{children}</a>
    }
    if (href?.startsWith('http://') || href?.startsWith('https://')) {
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    }
    return <span className="text-slate-500 dark:text-slate-400">{children}</span>
  },
}

export default function HelpPage({ onBack }: Props) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Help</h2>

      <Card className="p-4 max-w-3xl">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
            {userGuideMarkdown}
          </ReactMarkdown>
        </div>
      </Card>
    </div>
  )
}
