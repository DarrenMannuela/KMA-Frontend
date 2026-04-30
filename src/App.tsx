import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from '@/components/Sidebar'
import { NoteEditor } from '@/components/NoteEditor'
import { NotesPage } from '@/pages/NotesPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { TagsPage } from '@/pages/TagsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { Note } from '@/types'

export default function App() {
  const [editingNote, setEditingNote] = useState<Note | null | undefined>(undefined)
  // undefined = editor closed; null = new note; Note = editing existing

  const openNew = () => setEditingNote(null)
  const openEdit = (note: Note) => setEditingNote(note)
  const closeEditor = () => setEditingNote(undefined)

  return (
    <>
      <div className="flex min-h-screen">
        <Sidebar onNewNote={openNew} />
        <main className="flex-1 flex flex-col bg-paper">
          <Routes>
            <Route path="/" element={<NotesPage onEdit={openEdit} />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

      {editingNote !== undefined && (
        <NoteEditor note={editingNote} onClose={closeEditor} />
      )}

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            background: '#252020',
            color: '#faf8f3',
            borderRadius: '10px',
          },
          success: { iconTheme: { primary: '#fbbf24', secondary: '#252020' } },
        }}
      />
    </>
  )
}
