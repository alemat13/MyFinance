import { useToast } from '../context/ToastContext'

interface Props {
  /** A few of the selected payees, given to the assistant as examples. */
  samplePayees: string[]
  pattern: string
  replacement: string
}

/** The ready-made prompt sent to an AI assistant: how MyFinance applies the
 * regex (JavaScript flavour, every match, $1 replacement, trimmed result),
 * plus real payees from the selection so the answer fits them. */
export function buildRegexPrompt({ samplePayees, pattern, replacement }: Props): string {
  const lines = [
    'I need help writing a regular expression to bulk-rename transaction payees in my personal finance app.',
    '',
    'How the app applies it:',
    '- JavaScript regular expression syntax (no delimiters, no flags; there is a separate "Ignore case" checkbox).',
    '- Every match in each payee is replaced (global), not just the first one.',
    '- In the replacement, $1, $2... insert a captured group, $& the whole match and $$ a literal dollar sign; an empty replacement deletes the match.',
    '- Leading and trailing spaces are trimmed from the result; payees the pattern does not match are left unchanged.',
    '',
    'Here are some of the payees I selected:',
    ...samplePayees.map(p => `- ${p}`),
    '',
    'What I want them to become: [describe the result you want, e.g. "remove the PRLV SEPA prefix and keep the merchant name"]',
  ]
  if (pattern) {
    lines.push('', `My current attempt: pattern \`${pattern}\`, replacement \`${replacement}\``)
  }
  lines.push('', 'Please give me the pattern and the replacement to type, and show what each payee above would become.')
  return lines.join('\n')
}

function GeminiIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <defs>
        <linearGradient id="gemini-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path fill="url(#gemini-gradient)" d="M12 1c.6 5.6 4.4 10.4 11 11-6.6.6-10.4 5.4-11 11-.6-5.6-4.4-10.4-11-11 6.6-.6 10.4-5.4 11-11z" />
    </svg>
  )
}

function ClaudeIcon() {
  const rays = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <g fill="#D97757">
        {rays.map((angle, i) => (
          <rect key={angle} x="11" y={i % 2 ? 3.5 : 1.5} width="2" height={i % 2 ? 8.5 : 10.5} rx="1" transform={`rotate(${angle} 12 12)`} />
        ))}
      </g>
    </svg>
  )
}

function ChatGptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-900 dark:text-white" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {[0, 60, 120, 180, 240, 300].map(angle => (
          <rect key={angle} x="9" y="3" width="6" height="11" rx="3" transform={`rotate(${angle} 12 12)`} />
        ))}
      </g>
    </svg>
  )
}

export default function RegexHelpLinks(props: Props) {
  const { showToast } = useToast()
  const prompt = buildRegexPrompt(props)
  const encoded = encodeURIComponent(prompt)
  const linkClass = 'inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'

  // Gemini has no link that fills its prompt box, so the prompt is copied
  // first and pasted there by hand.
  const openGemini = () => {
    const open = () => window.open('https://gemini.google.com/app', '_blank', 'noopener')
    navigator.clipboard?.writeText(prompt)
      .then(() => showToast('Prompt copied, paste it into Gemini', 'success'))
      .catch(() => showToast('Could not copy the prompt'))
      .finally(open)
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span>Need help with your regex?</span>
      <button type="button" className={linkClass} onClick={openGemini} aria-label="Ask Gemini" title="Ask Gemini (the prompt is copied, paste it)">
        <GeminiIcon />
      </button>
      <a className={linkClass} href={`https://claude.ai/new?q=${encoded}`} target="_blank" rel="noopener noreferrer" aria-label="Ask Claude" title="Ask Claude">
        <ClaudeIcon />
      </a>
      <a className={linkClass} href={`https://chatgpt.com/?q=${encoded}`} target="_blank" rel="noopener noreferrer" aria-label="Ask ChatGPT" title="Ask ChatGPT">
        <ChatGptIcon />
      </a>
    </div>
  )
}
