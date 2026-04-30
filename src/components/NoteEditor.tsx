import { useState, useEffect, useCallback } from 'react'
import { X, Save, Tag, FolderOpen, Loader2 } from 'lucide-react'
import type { Note, CreateNoteRequest } from '@/types'
import { useCreateNote, useUpdateNote, useCategories, useTags } from '@/hooks'

interface NoteEditorProps {
  note?: Note | null
  onClose: () => void
}

export function NoteEditor({ note, onClose }: NoteEditorProps) {
  const isEdit = !!note

  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(note?.category_id ?? null)

  const { data: categories = [] } = useCategories()
  const { data: existingTags = [] } = useTags()

  const createNote = useCreateNote()
  const updateNote = useUpdateNote(note?.id ?? 0)

  const isPending = createNote.isPending || updateNote.isPending

  // Sync if note changes
  useEffect(() => {
    setTitle(note?.title ?? '')
    setContent(note?.content ?? '')
    setTags(note?.tags ?? [])
    setCategoryId(note?.category_id ?? null)
  }, [note])

  const handleSave = () => {
    const body: CreateNoteRequest = {
      title: title.trim() || 'Untitled',
      content,
      tags,
      category_id: categoryId,
    }
    if (isEdit) {
      updateNote.mutate(body, { onSuccess: onClose })
    } else {
      createNote.mutate(body, { onSuccess: onClose })
    }
  }

  const addTag = (value: string) => {
    const clean = value.trim().toLowerCase().replace(/\s+/g, '-')
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    },
    [title, content, tags, categoryId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-paper w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-ink-100 animate-fade-up"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <h2 className="font-display font-semibold text-ink-900 text-lg">
            {isEdit ? 'Edit Note' : 'New Note'}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={isPending} className="btn-primary">
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
            <button className="btn-ghost !px-2" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {/* Title */}
          <input
            type="text"
            placeholder="Note title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent font-display text-2xl font-semibold text-ink-900 placeholder:text-ink-300 focus:outline-none border-none"
          />

          {/* Category */}
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-ink-400 shrink-0" />
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="input-field !w-auto text-sm !py-1.5"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <textarea
            placeholder="Write your note here… (Markdown supported)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            className="input-field resize-none font-mono text-sm leading-relaxed flex-1 shadow-inset-sm"
          />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-ink-400" />
              <span className="font-body text-sm text-ink-600">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span key={tag} className="tag-pill cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag}
                  <span className="ml-0.5 text-amber-600 font-medium">×</span>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                list="existing-tags"
                placeholder="Add tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTag(tagInput)
                  }
                }}
                className="input-field text-sm !py-1.5 !w-40"
              />
              <datalist id="existing-tags">
                {existingTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <button className="btn-secondary text-xs !py-1.5" onClick={() => addTag(tagInput)}>
                Add
              </button>
            </div>
            <p className="font-body text-xs text-ink-300 mt-1">Press Enter or comma to add</p>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-ink-100 flex items-center justify-between">
          <p className="font-mono text-xs text-ink-300">⌘S to save</p>
          {isEdit && note && (
            <p className="font-body text-xs text-ink-300">
              Last edited {new Date(note.updated_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
