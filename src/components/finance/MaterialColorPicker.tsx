import { useState } from 'react'
import { Search, Palette } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight'
import { materialLabel } from '@/data/materialCatalogue'
import type { CatalogueMaterial, CatalogueColor } from '@/data/materialCatalogue'

// Shared by the Kas Bon entry form (a new line) and the Ledger's own line
// editor (an existing line) — same catalogue, same picker either way, so a
// colour picked while creating a line and one picked while fixing an
// existing line behave identically.

// A compact trigger (current pick, or a prompt) that opens
// MaterialColorPickerModal. Kept separate from that modal so each caller's
// open/closed state and search text are local to it, not threaded through
// whatever line-editing state the caller already owns. Generic over any
// registered catalogue's material, not SAI specifically — see
// materialCatalogue.ts.
export function MaterialColorPicker({ material, colors, selectedCode, onPick }: {
  material: CatalogueMaterial
  colors: CatalogueColor[]
  selectedCode?: string
  onPick: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const selected = selectedCode ? colors.find(c => c.code === selectedCode) : undefined

  return (
    <>
      {/* Full-width, bigger text/icon/touch-target and a visibly tinted
         border below `dock:` — the original compact, muted-gray inline
         trigger reads fine next to other dense desktop fields, but on a
         phone it was easy to miss entirely as just more label text rather
         than the one control that opens the colour grid. Unchanged above
         `dock:`. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-1 inline-flex items-center rounded-lg border transition-colors ${isMobile
          ? 'w-full justify-center gap-2.5 px-4 py-3 text-sm border-navy-200 bg-navy-50/70 hover:bg-navy-50 active:bg-navy-100 dark:border-navy-600 dark:bg-white/5 dark:hover:bg-white/10'
          : 'gap-1.5 px-2.5 py-1.5 text-xs border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 dark:border-navy-700 dark:hover:bg-white/5 dark:active:bg-white/10'}`}
      >
        {selected ? (
          <>
            <span className={`rounded-full ring-1 ring-black/10 shrink-0 ${isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5'}`} style={{ background: selected.hex }} />
            <span className={`font-mono ${isMobile ? 'font-semibold text-navy-900 dark:text-slate-50' : 'text-slate-700 dark:text-slate-300'}`}>{selected.code}</span>
            {selected.category && <span className={isMobile ? 'text-navy-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}>· {selected.category}</span>}
          </>
        ) : (
          <>
            <Palette size={isMobile ? 16 : 11} className={isMobile ? 'text-navy-700 dark:text-navy-200' : 'text-slate-500 dark:text-slate-400'} />
            <span className={isMobile ? 'font-medium text-navy-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}>Pick a colour ({colors.length})</span>
          </>
        )}
      </button>
      {open && (
        <MaterialColorPickerModal
          material={material}
          colors={colors}
          selectedCode={selectedCode}
          onPick={code => { onPick(code); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// The full picker: a search box and a grid of larger, labelled swatches
// (code, and category when the catalogue has one) — opened from the trigger
// above instead of living inline, since at up to 256 colours a labelled
// grid needs real room no Kas Bon line can spare permanently. Exported on
// its own too, for a caller (the Ledger table's own swatch dot) that wants
// to open the grid straight from a custom, more compact trigger of its own.
export function MaterialColorPickerModal({ material, colors, selectedCode, onPick, onClose }: {
  material: CatalogueMaterial
  colors: CatalogueColor[]
  selectedCode?: string
  onPick: (code: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const isMobile = useIsMobile()
  const viewportHeight = useVisualViewportHeight()
  const q = query.trim().toLowerCase()
  const filtered = q ? colors.filter(c => c.code.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q)) : colors

  return (
    <Modal title={`${materialLabel(material)} — colours`} onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            // Not on mobile: autofocus pops the keyboard immediately, which
            // on a phone covers roughly half the screen and, combined with
            // `vh` not shrinking for it, buried the actual colour grid
            // behind the keyboard before anyone could see or tap a swatch.
            autoFocus={!isMobile}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by number or category…"
            className="field !pl-9"
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} of {colors.length} colours</p>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10 dark:text-slate-400">No colour matches "{query}".</p>
        ) : (
          // Same real-viewport-height signal as Modal's own sheet sizing
          // (see useVisualViewportHeight) — so if the keyboard does open
          // (tapping search on purpose), the grid keeps fitting whatever
          // area is actually still visible instead of extending behind it.
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 overflow-y-auto pr-1 -mr-1" style={{ maxHeight: Math.max(160, viewportHeight * 0.45) }}>
            {filtered.map(c => (
              <button
                type="button"
                key={c.code}
                onClick={() => onPick(c.code)}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-colors ${selectedCode === c.code ? 'border-navy-700 bg-navy-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-white/5 dark:active:bg-white/10'}`}
              >
                <span className="w-10 h-10 rounded-full ring-1 ring-black/10 shrink-0" style={{ background: c.hex }} />
                <span className="font-mono text-xs text-navy-900 dark:text-slate-50">{c.code}</span>
                {c.category && <span className="text-[10px] text-slate-500 text-center leading-tight dark:text-slate-400">{c.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
