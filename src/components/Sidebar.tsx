import { NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen,
  FolderOpen,
  Tag,
  Plus,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { useCategories } from '@/hooks'

interface SidebarProps {
  onNewNote: () => void
}

export function Sidebar({ onNewNote }: SidebarProps) {
  const { data: categories = [] } = useCategories()
  const location = useLocation()

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-ink-100 bg-paper overflow-y-auto">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-ink-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-ink-900 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h1 className="font-display font-bold text-ink-900 text-base leading-none">KMA</h1>
            <p className="font-body text-xs text-ink-400 mt-0.5">Knowledge Base</p>
          </div>
        </div>
      </div>

      {/* New Note Button */}
      <div className="px-4 pt-4">
        <button onClick={onNewNote} className="btn-primary w-full justify-center">
          <Plus className="w-4 h-4" />
          New Note
        </button>
      </div>

      {/* Main Nav */}
      <nav className="px-3 pt-4 flex-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-lg font-body text-sm transition-colors duration-150 mb-1 ${
              isActive
                ? 'bg-ink-900 text-paper'
                : 'text-ink-600 hover:bg-parchment hover:text-ink-900'
            }`
          }
        >
          <BookOpen className="w-4 h-4" />
          All Notes
        </NavLink>

        <NavLink
          to="/tags"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-lg font-body text-sm transition-colors duration-150 mb-1 ${
              isActive
                ? 'bg-ink-900 text-paper'
                : 'text-ink-600 hover:bg-parchment hover:text-ink-900'
            }`
          }
        >
          <Tag className="w-4 h-4" />
          Tags
        </NavLink>

        <NavLink
          to="/categories"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-lg font-body text-sm transition-colors duration-150 mb-4 ${
              isActive
                ? 'bg-ink-900 text-paper'
                : 'text-ink-600 hover:bg-parchment hover:text-ink-900'
            }`
          }
        >
          <FolderOpen className="w-4 h-4" />
          Categories
        </NavLink>

        {/* Categories list */}
        {categories.length > 0 && (
          <div className="mb-4">
            <p className="px-3 mb-1 font-body text-xs font-medium text-ink-400 uppercase tracking-wider">
              Folders
            </p>
            {Array.isArray(categories) && categories.map((cat) => {
              const isActive = location.search.includes(`category_id=${cat.id}`)
              return (
                <NavLink
                  key={cat.id}
                  to={`/?category_id=${cat.id}`}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-body text-sm transition-colors duration-150 mb-0.5 ${
                    isActive
                      ? 'bg-amber-100 text-amber-900'
                      : 'text-ink-600 hover:bg-parchment hover:text-ink-900'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color || '#b0a389' }}
                  />
                  <span className="truncate flex-1">{cat.name}</span>
                  <ChevronRight className="w-3 h-3 text-ink-300 shrink-0" />
                </NavLink>
              )
            })}
          </div>
        )}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-4 border-t border-ink-100 pt-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-lg font-body text-sm transition-colors duration-150 ${
              isActive
                ? 'bg-ink-900 text-paper'
                : 'text-ink-600 hover:bg-parchment hover:text-ink-900'
            }`
          }
        >
          <Settings className="w-4 h-4" />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
