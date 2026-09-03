import { ArrowLeft } from 'lucide-react'

interface BackButtonProps {
  onClick: () => void
}

export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-accent hover:underline text-sm mb-4 cursor-pointer">
      <ArrowLeft size={14} /> Back
    </button>
  )
}
