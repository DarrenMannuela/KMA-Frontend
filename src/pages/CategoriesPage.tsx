import { useState } from 'react'
import { Plus, Edit3, Trash2, FolderOpen, Loader2 } from 'lucide-react'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks'
import type { Category, CreateCategoryRequest } from '@/types'

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#b0a389', '#665847',
]

function CategoryForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Category
  onSave: (data: CreateCategoryRequest) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? PALETTE[0])

  return (
    <div className="card p-5 animate-fade-up">
      <h3 className="font-display font-semibold text-ink-900 mb-4">
        {initial ? 'Edit Category' : 'New Category'}
      </h3>
      <div className="flex flex-col gap-3">
        <div>
          <label className="font-body text-xs font-medium text-ink-600 mb-1 block">Name *</label>
          <input
            type="text"
            placeholder="e.g. Research"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="font-body text-xs font-medium text-ink-600 mb-1 block">Description</label>
          <input
            type="text"
            placeholder="Optional description…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="font-body text-xs font-medium text-ink-600 mb-2 block">Colour</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-transform ${
                  color === c ? 'scale-125 ring-2 ring-offset-1 ring-ink-400' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary"
            disabled={!name.trim() || isPending}
            onClick={() => onSave({ name: name.trim(), description, color })}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const deleteCategory = useDeleteCategory()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const updateCategory = useUpdateCategory(editingId ?? 0)

  const handleCreate = (data: CreateCategoryRequest) => {
    createCategory.mutate(data, { onSuccess: () => setShowForm(false) })
  }

  const handleUpdate = (data: CreateCategoryRequest) => {
    if (editingId) {
      updateCategory.mutate(data, { onSuccess: () => setEditingId(null) })
    }
  }

  return (
    <div className="flex-1 p-8">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-8 animate-fade-up">
          <div>
            <h2 className="font-display text-3xl font-bold text-ink-900">Categories</h2>
            <p className="font-body text-ink-400 text-sm mt-1">
              Organise your notes into folders
            </p>
          </div>
          {!showForm && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" />
              New Category
            </button>
          )}
        </div>

        {showForm && (
          <div className="mb-4">
            <CategoryForm
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
              isPending={createCategory.isPending}
            />
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-ink-300">
            <div className="w-6 h-6 border-2 border-ink-200 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}

        <div className="flex flex-col gap-3 animate-fade-up animate-fade-up-delay-1">
          {categories.map((cat) =>
            editingId === cat.id ? (
              <CategoryForm
                key={cat.id}
                initial={cat}
                onSave={handleUpdate}
                onCancel={() => setEditingId(null)}
                isPending={updateCategory.isPending}
              />
            ) : (
              <div key={cat.id} className="card px-5 py-4 flex items-center gap-4 group">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: cat.color + '20' }}
                >
                  <FolderOpen className="w-5 h-5" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body font-medium text-ink-900">{cat.name}</p>
                  {cat.description && (
                    <p className="font-body text-sm text-ink-400 truncate">{cat.description}</p>
                  )}
                </div>
                {cat.note_count !== undefined && (
                  <span className="font-mono text-xs text-ink-400 bg-parchment px-2 py-1 rounded-md">
                    {cat.note_count}
                  </span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn-ghost !px-2" onClick={() => setEditingId(cat.id)}>
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    className="btn-ghost !px-2 hover:!text-red-600"
                    onClick={() => {
                      if (confirm(`Delete "${cat.name}"?`)) deleteCategory.mutate(cat.id)
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          )}

          {!isLoading && categories.length === 0 && !showForm && (
            <div className="text-center py-12 text-ink-300">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-body text-sm">No categories yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
