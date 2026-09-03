import { useMemo, useState } from 'react'
import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { NewKasBonDateModal } from '@/components/ui/NewKasBonDateModal'
import { formatRp } from '@/components/ui'
import { productionHooks, supplierHooks, useFinanceHeaders } from '@/hooks'
import { todayISODate, formatDateShort } from '@/utils/MonthUtils'
import { SI_UNITS } from '@/utils/Units'
import { suggestNextKasBonId } from '@/utils/KasBonId'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/constants/supplierCategories'
import type { ProductionRow, CreateProductionRowRequest } from '@/types'

interface ProductionSpreadsheetProps {
  /** Already filtered by the parent page (e.g. by month, and optionally by supplier). */
  data: ProductionRow[]
  /** New rows default to this supplier — set when the parent has drilled into one supplier. */
  defaultSupplierId?: number
  /** Turn off grouping when the parent has already filtered to a single supplier. */
  groupBySupplier?: boolean
}

export function ProductionSpreadsheet({ data, defaultSupplierId, groupBySupplier = true }: ProductionSpreadsheetProps) {
  const { data: suppliers = [] } = supplierHooks.useList()
  const { data: headers = [] } = useFinanceHeaders()
  const create = productionHooks.useCreate()
  const update = productionHooks.useUpdate()
  const del = productionHooks.useDelete()

  // Category tags on in both the dropdown and the Supplier column — two
  // suppliers can legitimately share a name (e.g. two "Sai Textile"
  // entries, one for sablon and one for embroidery work), and without the
  // category there's no way to tell them apart when picking or reading.
  const supplierOptions = suppliers.map(s => ({
    value: s.id,
    label: `${s.supplier_name} · ${CATEGORY_LABELS[s.supplier_category]}`,
  }))
  const unitOptions = SI_UNITS.map(u => ({ value: u, label: u }))
  const supplierName = (id: number) => suppliers.find(s => s.id === id)?.supplier_name ?? 'Unassigned'
  const supplierCategory = (id: number) => {
    const s = suppliers.find(s => s.id === id)
    return s ? CATEGORY_LABELS[s.supplier_category] : undefined
  }
  const supplierColor = (id: number) => {
    const s = suppliers.find(s => s.id === id)
    return s ? CATEGORY_COLORS[s.supplier_category] : undefined
  }

  // Existing Kas Bon IDs, offered as autocomplete suggestions on the ID
  // column — free typing still works for genuinely new IDs, this just
  // makes it easy to reuse an existing one instead of retyping it with a
  // typo (e.g. "1/KB/26" vs "01/KB/26"), which today would silently create
  // a second, disconnected header instead of erroring.
  const headerIdSuggestions = useMemo(
    () => Array.from(new Set(data.map(r => r.header_id))).sort(),
    [data]
  )

  // Full set of Kas Bon IDs that already exist (from headers, not just this
  // filtered `data` slice — `data` may be scoped to one month/supplier and
  // would otherwise mislabel an ID from a different month as "new").
  const existingHeaderIds = useMemo(
    () => new Set(headers.map(h => h.id)),
    [headers]
  )

  // Holds a row that's ready to submit except for its date, plus the
  // resolver SpreadsheetView is awaiting — set only when the typed
  // header_id doesn't match any existing Kas Bon.
  const [pendingNewKasBon, setPendingNewKasBon] = useState<{
    payload: CreateProductionRowRequest
    resolve: (keepGoing: boolean) => void
  } | null>(null)

  // When a supplier filter is active there's nothing left to group by
  // supplier — group by Kas Bon ID instead so items from the same header
  // sit together. Supplier drops out of the per-row columns in that mode
  // too, but purely because it's redundant to repeat (the filter already
  // guarantees every visible row has the same supplier) — not because it's
  // a shared header field anymore. Supplier now lives on ProductionItem,
  // so two material lines under the same Kas Bon can genuinely have
  // different suppliers; a group in the unfiltered/grouped-by-supplier
  // view can therefore have some of one Kas Bon's rows counted under one
  // supplier's subtotal and the rest under another's — that's intentional,
  // it reflects where the money actually went.
  //
  // Date isn't a per-row column — it lives on the shared FinanceHeader, not
  // the item, and now that formatDateShort's bug is fixed it displays
  // correctly in the group header (see renderGroupHeader below) without
  // repeating on every material line. New Kas Bons default to today's date
  // via emptyRowTemplate; there's currently no inline way to set a
  // different date at creation time.
  const groupedByHeader = !groupBySupplier

  // Intercepts creation: a brand-new Kas Bon ID has no date column of its
  // own to capture a date from, so pause here and ask via the modal instead
  // of silently taking emptyRowTemplate's today-default. Adding another
  // material line to an *existing* Kas Bon skips straight to create.mutate.
  const handleCreateRow = (row: Partial<ProductionRow>) => {
    const payload = row as CreateProductionRowRequest
    const isNewKasBon = !!payload.header_id && !existingHeaderIds.has(payload.header_id)

    if (!isNewKasBon) {
      // Same data-loss risk confirmNewKasBon's comment below describes and
      // fixes for a brand-new Kas Bon — SpreadsheetView removes a row from
      // the "New entries" buffer the instant onCreateRow is called, and
      // only restores it if onCreateRow's Promise later resolves false/
      // rejects. A bare create.mutate() here returned void ("optimistic,
      // discard immediately"), so a failed append to an *existing* Kas Bon
      // (network drop, a validation error) silently discarded whatever was
      // typed, with nothing to restore it — the exact loss the Promise
      // path exists to prevent, just not wired up on this (far more
      // common) branch. mutateAsync + resolving on the real outcome fixes
      // it here too.
      return new Promise<boolean>(resolve => {
        create.mutateAsync(payload).then(
          () => resolve(true),
          () => resolve(false),
        )
      })
    }

    return new Promise<boolean>(resolve => {
      setPendingNewKasBon({ payload, resolve })
    })
  }

  const confirmNewKasBon = (date: string) => {
    if (!pendingNewKasBon) return
    const { payload, resolve } = pendingNewKasBon
    setPendingNewKasBon(null)
    // mutateAsync (not mutate) — resolve(true) previously fired
    // unconditionally right after calling mutate, regardless of whether
    // the create actually succeeded. That meant a failed create (e.g. a
    // 409 on a Kas Bon ID someone else just took) still told
    // SpreadsheetView "this worked," so the row was discarded from the
    // "New entries" buffer with the typed data gone and nothing but a
    // toast to show for it — the exact loss SpreadsheetView's own
    // onCreateRow.catch() restore path exists to prevent, just bypassed
    // here by always resolving true. Tying resolve to the mutation's real
    // outcome lets that restore path do its job.
    create.mutateAsync({ ...payload, date }).then(
      () => resolve(true),
      () => resolve(false),
    )
  }

  // Resolving `false` tells SpreadsheetView to restore the typed row into
  // the "New entries" buffer rather than discarding it.
  const cancelNewKasBon = () => {
    if (!pendingNewKasBon) return
    pendingNewKasBon.resolve(false)
    setPendingNewKasBon(null)
  }

  const col = {
    header_id: {
      key: 'header_id', header: 'Kas Bon ID', type: 'text', editable: true, width: '110px', placeholder: 'e.g. 01/KB/26',
      suggestions: headerIdSuggestions, uppercase: true,
    } as ColumnDef<ProductionRow>,
    description: {
      key: 'description', header: 'Description', type: 'text', editable: true, placeholder: 'e.g. Beli bahan Basic 902', uppercase: true,
    } as ColumnDef<ProductionRow>,
    material_name: {
      key: 'material_name', header: 'Bahan', type: 'text', editable: true, placeholder: 'e.g. Basic 902', uppercase: true,
    } as ColumnDef<ProductionRow>,
    supplier_id: {
      key: 'supplier_id', header: 'Supplier', type: 'select', editable: true,
      options: supplierOptions,
      format: (val: number) => (
        <span className="inline-flex items-center gap-1.5">
          {supplierColor(Number(val)) && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: supplierColor(Number(val)) }}
              aria-hidden="true"
            />
          )}
          {supplierName(Number(val))}
          {supplierCategory(Number(val)) && (
            <span className="text-[10px] font-medium uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {supplierCategory(Number(val))}
            </span>
          )}
        </span>
      ),
    } as ColumnDef<ProductionRow>,
    amount: {
      key: 'amount', header: 'Qty', type: 'number', editable: true, width: '80px', allowDecimal: true,
    } as ColumnDef<ProductionRow>,
    si_unit: {
      key: 'si_unit', header: 'Unit', type: 'select', editable: true, options: unitOptions,
    } as ColumnDef<ProductionRow>,
    price: {
      key: 'price', header: 'Price', type: 'number', editable: true,
      format: (val: number) => <span className="currency font-mono">{formatRp(Number(val))}</span>,
    } as ColumnDef<ProductionRow>,
    total: {
      // key stays 'price', not a synthetic 'total' — ColumnDef['key'] is
      // typed as `keyof ProductionRow`, and 'total' isn't a real field
      // (it's the derived price * amount), so TS rejects anything else
      // here. The two columns render distinctly via their own `format`,
      // so this is safe as long as SpreadsheetView doesn't rely on `key`
      // being unique per column (e.g. for React list keys) — worth
      // confirming against SpreadsheetView's implementation if so.
      key: 'price', header: 'Total', type: 'number', editable: false,
      format: (_val: number, row: ProductionRow) => (
        <span className="currency font-mono font-semibold">{formatRp(row.price * row.amount)}</span>
      ),
    } as ColumnDef<ProductionRow>,
  }

  // Kas Bon ID, Description, Bahan, Qty, Unit, Price (+ Total).
  // Supplier only shows up when not already filtered to one.
  const columns: ColumnDef<ProductionRow>[] = groupedByHeader
    ? [col.header_id, col.description, col.material_name, col.amount, col.si_unit, col.price, col.total]
    : [col.header_id, col.description, col.material_name, col.supplier_id, col.amount, col.si_unit, col.price, col.total]

  return (
    <>
    <SpreadsheetView<ProductionRow>
      data={data}
      maxHeight="78vh"
      // Grouping by name string would silently merge two different
      // suppliers that happen to share a name (e.g. two "Sai Textile"
      // records — one sablon, one embroidery) into a single group. Group
      // by the actual supplier_id instead; renderGroupHeader below is what
      // turns that id back into a readable name + category for display.
      groupByKey={groupedByHeader ? (row => row.header_id) : (row => String(row.supplier_id))}
      renderGroupHeader={groupedByHeader
        ? (_groupName, rows) => {
            const first = rows[0]
            return (
              <>
                <span className="font-mono">{first.header_id}</span>
                <span className="text-slate-400 font-normal"> — {first.description || 'No description'}</span>
                <span className="text-slate-400 font-normal"> · {formatDateShort(first.date)}</span>
              </>
            )
          }
        : (_groupName, rows) => {
            const supplierId = rows[0].supplier_id
            const category = supplierCategory(supplierId)
            const color = supplierColor(supplierId)
            return (
              <span className="inline-flex items-center gap-1.5">
                {color && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                )}
                {supplierName(supplierId)}
                {category && (
                  <span className="text-[10px] font-medium uppercase tracking-wide bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                    {category}
                  </span>
                )}
              </span>
            )
          }}
      calculateSubtotal={row => row.price * row.amount}
      keyColumn="id"
      triggerColumn="material_name"
      emptyRowTemplate={() => ({
        // Same suggestion Quick Add uses (useKasBonIdSuggestion ->
        // suggestNextKasBonId) — a fresh row starts pre-filled with the
        // next Kas Bon number instead of blank, but it's still just a
        // regular editable field, so typing over it works exactly like
        // overriding Quick Add's suggestion.
        header_id: suggestNextKasBonId(headers),
        description: '',
        supplier_id: defaultSupplierId ?? suppliers[0]?.id ?? 0,
        material_name: '',
        // '' rather than a real 0 — required.every(isFilled) below treats
        // 0 as already "filled" (it's non-empty/non-null), so a numeric
        // default let a row graduate into a real record via material_name
        // alone, with price still untouched. Blank makes the required
        // check actually mean something; EditableCell's number handling
        // converts it to a real number the moment it's typed, before the
        // row can ever submit.
        price: '',
        si_unit: 'yard',
        amount: 1,
        date: todayISODate(),
      })}
      // material_name alone used to be enough to submit a row — price
      // could still be sitting at its numeric default and slip through
      // uncaught. Requiring both keeps a row staged in "New entries"
      // until there's an actual price on it.
      requiredColumns={['material_name', 'price']}
      onCreateRow={handleCreateRow}
      onUpdateRow={(id, body) => update.mutate({ id: Number(id), body })}
      onDeleteRow={(id) => del.mutate(Number(id))}
      columns={columns}
    />
    {pendingNewKasBon && (
      <NewKasBonDateModal
        headerId={pendingNewKasBon.payload.header_id}
        defaultDate={pendingNewKasBon.payload.date || todayISODate()}
        onConfirm={confirmNewKasBon}
        onCancel={cancelNewKasBon}
      />
    )}
    </>
  )
}