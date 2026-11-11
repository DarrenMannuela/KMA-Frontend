/** A key, drawn like a keycap. */
export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1.5 rounded-md border border-slate-200 bg-white
        font-sans text-[11px] font-medium text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.10)]
        dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300 dark:shadow-[0_1px_0_rgba(0,0,0,0.4)] ${className}`}
    >
      {children}
    </kbd>
  )
}
