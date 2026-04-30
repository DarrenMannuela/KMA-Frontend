import axios from 'axios'
import type {
  Note,
  Category,
  CreateNoteRequest,
  UpdateNoteRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  PaginatedResponse,
  NotesFilter,
} from '@/types'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ─── Request / Response interceptors ─────────────────────────────────────────

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// ─── Notes ────────────────────────────────────────────────────────────────────

export const notesApi = {
  list: async (filter: Partial<NotesFilter> = {}): Promise<PaginatedResponse<Note>> => {
    const params = new URLSearchParams()
    if (filter.search)       params.set('search', filter.search)
    if (filter.category_id)  params.set('category_id', String(filter.category_id))
    if (filter.tag)          params.set('tag', filter.tag)
    if (filter.page)         params.set('page', String(filter.page))
    if (filter.limit)        params.set('limit', String(filter.limit))
    const res = await client.get<PaginatedResponse<Note>>(`/notes?${params}`)
    return res.data
  },

  get: async (id: number): Promise<Note> => {
    const res = await client.get<Note>(`/notes/${id}`)
    return res.data
  },

  create: async (body: CreateNoteRequest): Promise<Note> => {
    const res = await client.post<Note>('/notes', body)
    return res.data
  },

  update: async (id: number, body: UpdateNoteRequest): Promise<Note> => {
    const res = await client.put<Note>(`/notes/${id}`, body)
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await client.delete(`/notes/${id}`)
  },
}

// ─── Categories ───────────────────────────────────────────────────────────────

export const categoriesApi = {
  list: async (): Promise<Category[]> => {
    const res = await client.get<Category[]>('/categories')
    return res.data
  },

  get: async (id: number): Promise<Category> => {
    const res = await client.get<Category>(`/categories/${id}`)
    return res.data
  },

  create: async (body: CreateCategoryRequest): Promise<Category> => {
    const res = await client.post<Category>('/categories', body)
    return res.data
  },

  update: async (id: number, body: UpdateCategoryRequest): Promise<Category> => {
    const res = await client.put<Category>(`/categories/${id}`, body)
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await client.delete(`/categories/${id}`)
  },
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tagsApi = {
  list: async (): Promise<string[]> => {
    const res = await client.get<string[]>('/tags')
    return res.data
  },
}
