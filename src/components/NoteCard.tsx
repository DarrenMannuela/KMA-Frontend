import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Trash2, Edit3, MoreHorizontal } from 'lucide-react'
import type { Note } from '@/types'
import { useDeleteNote } from '@/hooks'

interface NoteCardProps {
  note: Note
  onEdit: (note: Note) => void
  viewMode?: 'grid' | 'list'
}

export function NoteCard({ note, onEdit, viewMode = 'grid' }: NoteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const deleteNote = useDeleteNote()

  const handleDelete = () => {
    if (confirm('Delete this note?')) {
      deleteNote.mutate(note.id)
    }
    setMenuOpen(false)
  }

  const preview = note.content.replace(/[#*`_]/g, '').slice(0, 140)
  const timeAgo = formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })

  if (viewMode === 'list') {
    return (
      <div className="card flex items-start gap-4 p-4 group animate-fade-up">
        <div className="flex-1 min-w-0">
          <h3
            className="font-display font-semibold text-ink-900 text-base truncate cursor-pointer hover:text-amber-700 transition-colors"
            onClick={() => onEdit(note)}
          >
            {note.title || 'Untitled'}
          </h3>
          <p className="font-body text-sm text-ink-500 mt-0.5 truncate">{preview}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {note.category && (
              <span className="font-body text-xs text-ink-400 flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: note.category.color || '#b0a389' }}
                />
                {note.category.name}
              </span>
            )}
            {note.tags?.slice(0, 3).map((tag) => (
              <span key={tag} className="tag-pill">{tag}</span>
            ))}
            <span className="font-body text-xs text-ink-300 ml-auto">{timeAgo}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button className="btn-ghost !px-2 !py-1.5" onClick={() => onEdit(note)}>
            <Edit3 className="w-4 h-4" />
          </button>
          <button className="btn-ghost !px-2 !py-1.5 hover:!text-red-600" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-5 flex flex-col group relative animate-fade-up cursor-pointer" onClick={() => onEdit(note)}>
      {/* Menu */}
      <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-parchment transition-all"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <MoreHorizontal className="w-4 h-4 text-ink-500" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 w-36 bg-white rounded-lg border border-ink-100 shadow-card-hover z-20 py-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 font-body text-sm text-ink-700 hover:bg-parchment transition-colors"
              onClick={() => { onEdit(note); setMenuOpen(false) }}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 font-body text-sm text-red-600 hover:bg-red-50 transition-colors"
              onClick={handleDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Category indicator */}
      {note.category && (
        <div className="flex items-center gap-1.5 mb-3">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: note.category.color || '#b0a389' }}
          />
          <span className="font-body text-xs text-ink-400">{note.category.name}</span>
        </div>
      )}

      <h3 className="font-display font-semibold text-ink-900 text-lg leading-snug mb-2 line-clamp-2">
        {note.title || 'Untitled'}
      </h3>

      <p className="font-body text-sm text-ink-500 leading-relaxed line-clamp-3 flex-1">
        {preview || <span className="italic text-ink-300">No content yet…</span>}
      </p>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-ink-50 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {note.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="tag-pill">{tag}</span>
          ))}
          {(note.tags?.length ?? 0) > 2 && (
            <span className="tag-pill bg-ink-100 text-ink-500">+{note.tags.length - 2}</span>
          )}
        </div>
        <span className="font-body text-xs text-ink-300 shrink-0">{timeAgo}</span>
      </div>
    </div>
  )
}
