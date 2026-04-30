import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { notesApi, categoriesApi, tagsApi } from '@/api'
import type {
  CreateNoteRequest,
  UpdateNoteRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  NotesFilter,
} from '@/types'

// ─── Query keys ───────────────────────────────────────────────────────────────

export const keys = {
  notes: (filter?: Partial<NotesFilter>) => ['notes', filter] as const,
  note:  (id: number)                    => ['notes', id]     as const,
  categories:                              ['categories']      as const,
  category:  (id: number)                => ['categories', id] as const,
  tags:                                    ['tags']            as const,
}

// ─── Notes Hooks ─────────────────────────────────────────────────────────────

export function useNotes(filter: Partial<NotesFilter> = {}) {
  return useQuery({
    queryKey: keys.notes(filter),
    queryFn: () => notesApi.list(filter),
  })
}

export function useNote(id: number) {
  return useQuery({
    queryKey: keys.note(id),
    queryFn: () => notesApi.get(id),
    enabled: id > 0,
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateNoteRequest) => notesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateNote(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateNoteRequest) => notesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => notesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Category Hooks ───────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: categoriesApi.list,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => categoriesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories })
      toast.success('Category created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateCategory(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateCategoryRequest) => categoriesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories })
      toast.success('Category updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => categoriesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.categories })
      toast.success('Category deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Tags Hook ────────────────────────────────────────────────────────────────

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: tagsApi.list,
  })
}
