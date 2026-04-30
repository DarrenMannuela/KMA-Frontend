// ─── Core Domain Types ───────────────────────────────────────────────────────

export interface Note {
  id: number
  title: string
  content: string
  tags: string[]
  category_id: number | null
  category?: Category
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  name: string
  description: string
  color: string
  note_count?: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  name: string
  note_count?: number
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export interface CreateNoteRequest {
  title: string
  content: string
  tags?: string[]
  category_id?: number | null
}

export interface UpdateNoteRequest extends Partial<CreateNoteRequest> {}

export interface CreateCategoryRequest {
  name: string
  description?: string
  color?: string
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// ─── UI State Types ───────────────────────────────────────────────────────────

export type ViewMode = 'grid' | 'list'

export interface NotesFilter {
  search: string
  category_id: number | null
  tag: string | null
  page: number
  limit: number
}
