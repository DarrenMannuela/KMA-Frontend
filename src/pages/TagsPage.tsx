import { useNavigate } from 'react-router-dom'
import { Tag } from 'lucide-react'
import { useTags } from '@/hooks'

export function TagsPage() {
  const { data: tags = [], isLoading } = useTags()
  const navigate = useNavigate()

  return (
    <div className="flex-1 p-8">
      <div className="mb-8 animate-fade-up">
        <h2 className="font-display text-3xl font-bold text-ink-900">Tags</h2>
        <p className="font-body text-ink-400 text-sm mt-1">Browse notes by tag</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-ink-300">
          <div className="w-6 h-6 border-2 border-ink-200 border-t-amber-400 rounded-full animate-spin" />
        </div>
      )}

      <div className="flex flex-wrap gap-3 animate-fade-up animate-fade-up-delay-1">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => navigate(`/?tag=${encodeURIComponent(tag)}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-ink-100 shadow-card
                       font-body text-sm text-ink-700 hover:border-amber-300 hover:shadow-card-hover
                       transition-all duration-150 active:scale-95"
          >
            <Tag className="w-3.5 h-3.5 text-amber-500" />
            {tag}
          </button>
        ))}

        {!isLoading && tags.length === 0 && (
          <div className="w-full text-center py-12 text-ink-300">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-body text-sm">No tags yet — add some when editing a note</p>
          </div>
        )}
      </div>
    </div>
  )
}
