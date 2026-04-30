import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, LayoutGrid, List, SlidersHorizontal } from 'lucide-react'
import { useNotes } from '@/hooks'
import { NoteCard } from '@/components/NoteCard'
import type { Note, ViewMode } from '@/types'

interface NotesPageProps {
  onEdit: (note: Note) => void
}

export function NotesPage({ onEdit }: NotesPageProps) {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const categoryId = searchParams.get('category_id')
    ? Number(searchParams.get('category_id'))
    : null
  const tag = searchParams.get('tag') ?? null

  const { data, isLoading, isError } = useNotes({
    search: search || undefined,
    category_id: categoryId,
    tag: tag ?? undefined,
    limit: 50,
  })

  const notes = data?.data ?? []

  return (
    <div className="flex-1 flex flex-col min-h-screen p-8">
      {/* Page header */}
      <div className="mb-8 animate-fade-up">
        <h2 className="font-display text-3xl font-bold text-ink-900 mb-1">
          {categoryId ? 'Category Notes' : tag ? `#${tag}` : 'All Notes'}
        </h2>
        <p className="font-body text-ink-400 text-sm">
          {isLoading ? 'Loading…' : `${data?.total ?? 0} notes`}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 animate-fade-up animate-fade-up-delay-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field !pl-9"
          />
        </div>
        <div className="flex items-center gap-1 border border-ink-200 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid' ? 'bg-ink-900 text-paper' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-ink-900 text-paper' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        <button className="btn-ghost">
          <SlidersHorizontal className="w-4 h-4" />
          Filter
        </button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-ink-300">
            <div className="w-8 h-8 rounded-full border-2 border-ink-200 border-t-amber-400 animate-spin" />
            <p className="font-body text-sm">Loading notes…</p>
          </div>
        </div>
      )}

      {isError && (
        <div className="flex-1 flex items-center justify-center">
          <div className="card p-8 text-center max-w-sm">
            <p className="font-display text-xl text-red-700 mb-2">Could not load notes</p>
            <p className="font-body text-sm text-ink-500">
              Make sure the KMA backend is running on{' '}
              <code className="font-mono text-xs bg-parchment px-1 py-0.5 rounded">
                localhost:8080
              </code>
            </p>
          </div>
        </div>
      )}

      {!isLoading && !isError && notes.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-parchment flex items-center justify-center">
              <Search className="w-7 h-7 text-ink-300" />
            </div>
            <p className="font-display text-xl text-ink-700 mb-2">No notes yet</p>
            <p className="font-body text-sm text-ink-400">Create your first note to get started</p>
          </div>
        </div>
      )}

      {!isLoading && !isError && notes.length > 0 && (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'flex flex-col gap-2'
          }
        >
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onEdit={onEdit} viewMode={viewMode} />
          ))}
        </div>
      )}
    </div>
  )
}
