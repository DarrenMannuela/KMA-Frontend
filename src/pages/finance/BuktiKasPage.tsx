import { useMemo, useState } from 'react'
import { Banknote, Plus, Pencil, Trash2 } from 'lucide-react'
import { ConfirmDialog, FormField, formatRp } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/Page'
import { useIsMobile } from '@/hooks/useIsMobile'
import { buktiKasHooks, orderHooks } from '@/hooks'
import { suggestNextBuktiKasId } from '@/utils/BuktiKasId'
import { todayISODate, formatDateShort } from '@/utils/MonthUtils'
import { orderLabel } from '@/components/finance/ledgerModel'
import type { BuktiKasRow } from '@/types'

// Cash RECEIVED, grouped by Bukti Kas header the same way Kas Bon groups
// production/operation lines — see types/finance.ts's own comment for why
// this is a separate header type rather than a third `kind` on FinanceHeader.
// Deliberately simpler than the Kas Bon Ledger (no paste-from-Excel, no
// column guessing, no month-by-month navigation yet) — a Bukti Kas list is
// expected to be far shorter than a year of production/operation lines, so
// the extra machinery wasn't worth building before it's clear it's needed.
export function BuktiKasPage() {
  const isMobile = useIsMobile()
  const { data: rows = [], isLoading, isError, refetch } = buktiKasHooks.useList()
  const { data: orders = [] } = orderHooks.useList()
  const del = buktiKasHooks.useDelete()

  const [formFor, setFormFor] = useState<{ headerId?: string } | null>(null)
  const [editingRow, setEditingRow] = useState<BuktiKasRow | null>(null)
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<BuktiKasRow | null>(null)

  // One card per header, newest first — each with its lines and their sum.
  const headers = useMemo(() => {
    const map = new Map<string, { header_id: string; date: string; description: string; rows: BuktiKasRow[] }>()
    for (const r of rows) {
      if (!map.has(r.header_id)) map.set(r.header_id, { header_id: r.header_id, date: r.date, description: r.description, rows: [] })
      map.get(r.header_id)!.rows.push(r)
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.header_id.localeCompare(a.header_id))
  }, [rows])

  const grandTotal = rows.reduce((n, r) => n + r.price, 0)

  if (isLoading) return <LoadingState label="Loading Bukti Kas…" />
  if (isError) return <div className="p-4 md:p-6"><div className="card"><ErrorState what="Bukti Kas" onRetry={refetch} /></div></div>

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <PageHeader
        icon={Banknote}
        title="Bukti Kas"
        subtitle={`Cash received · ${formatRp(grandTotal)} total`}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setFormFor({})}>
            <Plus size={14} /> Add New
          </button>
        }
      />

      {headers.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">
          No Bukti Kas yet — click Add New to record cash received.
        </div>
      ) : (
        <div className="space-y-4">
          {headers.map(h => {
            const total = h.rows.reduce((n, r) => n + r.price, 0)
            return (
              <div key={h.header_id} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-navy-50 border-b border-navy-100 flex-wrap">
                  <div className="min-w-0">
                    <span className="id-chip font-mono">{h.header_id}</span>
                    <span className="ml-2 text-sm text-navy-900 font-medium">{h.description}</span>
                    <span className="ml-2 text-xs font-medium text-slate-600">{formatDateShort(h.date)}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold text-navy-900">{formatRp(total)}</span>
                    <button className="btn-ghost btn-sm !px-2" onClick={() => setFormFor({ headerId: h.header_id })} title="Add another line to this Bukti Kas">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {isMobile ? (
                  <div className="divide-y divide-slate-50">
                    {h.rows.map(r => (
                      <div key={r.id} className="p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{r.item_description}</span>
                          <span className="font-mono font-semibold shrink-0">{formatRp(r.price)}</span>
                        </div>
                        {r.order_id && <div className="text-xs text-slate-400 mt-1">Order: {orderLabel(orders, r.order_id)}</div>}
                        <div className="flex items-center gap-4 mt-3">
                          <button className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1.5" onClick={() => setEditingRow(r)}>
                            <Pencil size={14} /> Edit
                          </button>
                          <button className="text-slate-400 hover:text-red-500 text-xs flex items-center gap-1.5" onClick={() => setConfirmDeleteRow(r)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="kma-table">
                      <thead>
                        <tr><th>Description</th><th>Order</th><th className="!text-right">Amount</th><th /></tr>
                      </thead>
                      <tbody>
                        {h.rows.map(r => (
                          <tr key={r.id}>
                            <td>{r.item_description}</td>
                            <td className="text-slate-500 text-xs">{r.order_id ? orderLabel(orders, r.order_id) : '—'}</td>
                            <td className="text-right font-mono">{formatRp(r.price)}</td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button className="btn-ghost btn-sm !px-2" onClick={() => setEditingRow(r)}><Pencil className="w-3.5 h-3.5" /></button>
                                <button className="btn-ghost btn-sm !px-1.5 hover:!text-red-600" onClick={() => setConfirmDeleteRow(r)}><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {formFor && (
        <BuktiKasLineForm
          headers={headers.map(h => ({ id: h.header_id, date: h.date, description: h.description }))}
          orders={orders}
          headerId={formFor.headerId}
          onClose={() => setFormFor(null)}
        />
      )}

      {editingRow && (
        <BuktiKasEditForm row={editingRow} orders={orders} onClose={() => setEditingRow(null)} />
      )}

      {confirmDeleteRow && (
        <ConfirmDialog
          message={`Delete "${confirmDeleteRow.item_description}" (${formatRp(confirmDeleteRow.price)}) from ${confirmDeleteRow.header_id}?`}
          onConfirm={() => { del.mutate(confirmDeleteRow.id); setConfirmDeleteRow(null) }}
          onCancel={() => setConfirmDeleteRow(null)}
        />
      )}
    </div>
  )
}

// New Bukti Kas (or another line on an existing one) — header fields only
// editable when starting a new one; adding to an existing Bukti Kas reuses
// its date/description as-is, same convention as Kas Bon's "add a line".
function BuktiKasLineForm({ headers, orders, headerId: existingId, onClose }: {
  headers: { id: string; date: string; description: string }[]
  orders: { id: string; company?: string | null }[]
  headerId?: string
  onClose: () => void
}) {
  const existing = existingId ? headers.find(h => h.id === existingId) : undefined
  const create = buktiKasHooks.useCreate()
  const [date, setDate] = useState(existing?.date ?? todayISODate())
  const [id, setId] = useState(existing?.id ?? suggestNextBuktiKasId(headers))
  const [idTouched, setIdTouched] = useState(!!existing)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [itemDescription, setItemDescription] = useState('')
  const [price, setPrice] = useState('')
  const [orderId, setOrderId] = useState('')
  const [missing, setMissing] = useState(false)

  const changeDate = (value: string) => {
    setDate(value)
    if (!idTouched && value) setId(suggestNextBuktiKasId(headers, Number(value.slice(0, 4))))
  }

  const submit = () => {
    const headerIdTrimmed = id.trim().toUpperCase()
    const priceNum = Number(price)
    if (!headerIdTrimmed || !date || !itemDescription.trim() || !(priceNum > 0)) {
      setMissing(true)
      return
    }
    create.mutate({
      header_id: headerIdTrimmed, date, description: (description.trim() || itemDescription.trim()).toUpperCase(),
      item_description: itemDescription.trim().toUpperCase(), price: Math.round(priceNum),
      order_id: orders.some(o => o.id === orderId) ? orderId : null,
    }, { onSuccess: onClose })
  }

  return (
    <Modal title={existing ? `Add a line to ${existing.id}` : 'Add Bukti Kas'} onClose={onClose}>
      <div className="space-y-4">
        {!existing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Bukti Kas No." required>
              <input className={`field font-mono ${missing && !id.trim() ? '!border-red-400' : ''}`}
                value={id} onChange={e => { setId(e.target.value.toUpperCase()); setIdTouched(true) }} />
            </FormField>
            <FormField label="Date" required>
              <input className={`field ${missing && !date ? '!border-red-400' : ''}`} type="date" value={date} onChange={e => changeDate(e.target.value)} />
            </FormField>
            <div className="col-span-1 sm:col-span-2">
              <FormField label="Description (optional)">
                <input className="field" placeholder="What this Bukti Kas is for overall" value={description}
                  onChange={e => setDescription(e.target.value.toUpperCase())} />
              </FormField>
            </div>
          </div>
        )}
        <FormField label="Received for" required>
          <input className={`field ${missing && !itemDescription.trim() ? '!border-red-400' : ''}`}
            placeholder="e.g. Pelunasan from Zenbu" value={itemDescription}
            onChange={e => setItemDescription(e.target.value.toUpperCase())} />
        </FormField>
        <FormField label="Amount (Rp)" required>
          <input className={`field font-mono ${missing && !(Number(price) > 0) ? '!border-red-400' : ''}`}
            inputMode="numeric" value={price ? Number(price).toLocaleString('id-ID') : ''}
            onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} />
        </FormField>
        <FormField label="Order (optional)">
          <input className="field font-mono text-sm" placeholder="Order ID this cash was for" list="bukti-kas-order-list"
            value={orderId} onChange={e => setOrderId(e.target.value.toUpperCase())} />
          <datalist id="bukti-kas-order-list">
            {orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)}
          </datalist>
        </FormField>
        <button className="btn-primary w-full" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'Saving…' : 'Add'}
        </button>
      </div>
    </Modal>
  )
}

// Editing one existing line — description/amount/order only; the header's
// own date/description change from the header card itself, not here (same
// split OrderDetailPage/DeliveryItemsManager use elsewhere in this app).
function BuktiKasEditForm({ row, orders, onClose }: {
  row: BuktiKasRow
  orders: { id: string; company?: string | null }[]
  onClose: () => void
}) {
  const update = buktiKasHooks.useUpdate()
  const [itemDescription, setItemDescription] = useState(row.item_description)
  const [price, setPrice] = useState(String(row.price))
  const [orderId, setOrderId] = useState(row.order_id ?? '')
  const [missing, setMissing] = useState(false)

  const submit = () => {
    const priceNum = Number(price)
    if (!itemDescription.trim() || !(priceNum > 0)) {
      setMissing(true)
      return
    }
    update.mutate({
      id: row.id,
      fields: {
        description: itemDescription.trim().toUpperCase(), price: Math.round(priceNum),
        order_id: orders.some(o => o.id === orderId) ? orderId : null,
      },
    }, { onSuccess: onClose })
  }

  return (
    <Modal title={`Edit line on ${row.header_id}`} onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Received for" required>
          <input className={`field ${missing && !itemDescription.trim() ? '!border-red-400' : ''}`}
            value={itemDescription} onChange={e => setItemDescription(e.target.value.toUpperCase())} />
        </FormField>
        <FormField label="Amount (Rp)" required>
          <input className={`field font-mono ${missing && !(Number(price) > 0) ? '!border-red-400' : ''}`}
            inputMode="numeric" value={price ? Number(price).toLocaleString('id-ID') : ''}
            onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} />
        </FormField>
        <FormField label="Order (optional)">
          <input className="field font-mono text-sm" placeholder="Order ID this cash was for" list="bukti-kas-order-list-edit"
            value={orderId} onChange={e => setOrderId(e.target.value.toUpperCase())} />
          <datalist id="bukti-kas-order-list-edit">
            {orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)}
          </datalist>
        </FormField>
        <button className="btn-primary w-full" disabled={update.isPending} onClick={submit}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
