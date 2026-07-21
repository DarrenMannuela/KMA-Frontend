import { useState, useMemo } from 'react'
import { Plus, Pencil, Check, X, Copy, Box } from 'lucide-react'
import toast from 'react-hot-toast'
import { FormField } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { deliveryHooks, deliveryItemHooks, useOrderRemainingItems } from '@/hooks'
import { OrderItemSelect } from './DeliveryOrderItemSelect'
import type { DeliveryItem, CreateDeliveryItemRequest } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Single implementation of "add / edit / view delivery items," used by
// DeliveryDetailPage — the workflow is always "open the DO you're packing,
// fill its boxes with what the client ordered, print when done," so the
// delivery is always known from the route (`/delivery/:id`); there's no
// cross-delivery workspace anymore. Previously this logic was duplicated
// across DeliveryItemForm + a flat table AND DeliveryItemsQuickAdd +
// DeliveryItemsByBox, which had drifted apart (only one supported
// duplicating a row, "Max N available" was copy-pasted three times).
// Consolidating means a fix to one only needs to happen once.
// ─────────────────────────────────────────────────────────────────────────────

const emptyQuickAddItem = () => ({ item_name: '', size: '', amount: 1, box_number: null as number | null })

// Alternating badge colors just to make adjacent boxes visually distinct at
// a glance when scrolling a long list — the number itself is still the
// source of truth, this is purely a scan-ability aid.
const BOX_BADGE_COLORS = [
  'bg-navy-900', 'bg-blue-700', 'bg-teal-700', 'bg-purple-700', 'bg-amber-700', 'bg-rose-700',
]

// Reserves a fixed-height line under every field, whether or not it has
// hint text this render. Grid rows stretch to their tallest cell — without
// this, a field that conditionally grows (e.g. Amount's "Max N available")
// makes its row taller than its neighbors, and anything bottom-aligned in
// that row (the submit button) visibly drops relative to inputs that
// aren't. Reserving the same slot everywhere keeps every cell the same
// height regardless of which hints are showing.
function FieldHint({ children }: { children?: React.ReactNode }) {
  return <p className="text-xs text-slate-400 mt-1 h-4 leading-4">{children ?? '\u00A0'}</p>
}

interface DeliveryItemsManagerProps {
  deliveryId: string
}

export function DeliveryItemsManager({ deliveryId }: DeliveryItemsManagerProps) {
  const { data: deliveries = [] } = deliveryHooks.useList()
  const { data: allItems = [], isLoading } = deliveryItemHooks.useList()
  const create = deliveryItemHooks.useCreate()

  const [open, setOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(emptyQuickAddItem())
  const [missing, setMissing] = useState(false)
  const [duplicatingFrom, setDuplicatingFrom] = useState<DeliveryItem | null>(null)
  const [editingItem, setEditingItem] = useState<DeliveryItem | null>(null)

  const selectedDelivery = deliveries.find(d => d.id === deliveryId)
  const isDO = (selectedDelivery?.type ?? 'DO') === 'DO'
  const orderId = selectedDelivery?.order_id ?? null
  const remainingItems = useOrderRemainingItems(orderId, editingItem?.id)
  const maxAmount = orderId
    ? (remainingItems.find(r => r.item_name === quickAdd.item_name && (r.size ?? '') === (quickAdd.size ?? ''))?.remaining ?? null)
    : null

  const items = useMemo(
    () => allItems.filter(i => i.delivery_id === deliveryId),
    [allItems, deliveryId]
  )

  const boxGroups = useMemo(() => {
    if (!isDO) return []
    const map = new Map<string, DeliveryItem[]>()
    items.forEach(item => {
      const key = item.box_number != null ? String(item.box_number) : 'unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    })
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'unassigned') return 1
      if (b === 'unassigned') return -1
      return Number(a) - Number(b)
    })
  }, [items, isDO])

  // Recap — every item/size totaled across ALL boxes, so you can verify
  // "24 Kemeja Server M total" without adding up each box card by hand.
  const recap = useMemo(() => {
    const map = new Map<string, { item_name: string; size: string | null; total: number }>()
    items.forEach(item => {
      const key = `${item.item_name}|${item.size ?? ''}`
      if (!map.has(key)) map.set(key, { item_name: item.item_name, size: item.size, total: 0 })
      map.get(key)!.total += item.amount
    })
    return Array.from(map.values()).sort((a, b) => a.item_name.localeCompare(b.item_name))
  }, [items])

  const openAdd = () => { setDuplicatingFrom(null); setQuickAdd(emptyQuickAddItem()); setMissing(false); setOpen(true) }
  const openDuplicate = (item: DeliveryItem) => {
    setDuplicatingFrom(item)
    setQuickAdd({ item_name: item.item_name, size: item.size ?? '', amount: item.amount, box_number: item.box_number })
    setMissing(false)
    setOpen(true)
  }

  const handleAdd = () => {
    if (!quickAdd.item_name) {
      setMissing(true)
      toast.error('Item name is required')
      return
    }
    if (maxAmount != null && quickAdd.amount > maxAmount) {
      toast.error(`Only ${maxAmount} left for this item`)
      return
    }
    setMissing(false)
    const payload: CreateDeliveryItemRequest = {
      delivery_id: deliveryId,
      item_name:   quickAdd.item_name,
      size:        quickAdd.size || null,
      amount:      quickAdd.amount || 1,
      box_number:   quickAdd.box_number,
    }
    create.mutate(payload, {
      onSuccess: () => {
        // Only the item-level fields reset — the delivery itself is fixed
        // by the page, so the next box/item can be typed straight away
        // without reopening the panel.
        setDuplicatingFrom(null)
        setQuickAdd(emptyQuickAddItem())
      },
    })
  }

  if (!deliveryId) {
    return (
      <div className="card p-10 text-center text-slate-400 text-sm">
        Delivery not found.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-navy-900 text-sm">
          {isDO ? 'Box Contents' : 'Documents'} ({items.length})
        </h2>
        <button className="btn-primary flex items-center gap-1 !py-1.5 text-sm" onClick={open ? () => setOpen(false) : openAdd}>
          <Plus size={14} /> {isDO ? 'Add Item' : 'Add Document'}
        </button>
      </div>

      {open && (
        <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50">
          <div className="col-span-2 md:col-span-4 -mb-1 space-y-2">
            <p className="text-xs text-slate-400">
              Adding to this delivery — stays open so you can add the next {isDO ? 'item' : 'document'} right away.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 border border-navy-100 rounded-full px-2.5 py-1">
              Adding to <span className="font-mono font-semibold">{deliveryId}</span>
              {selectedDelivery && (
                <span className="text-navy-400 font-normal"> · {isDO ? 'Delivery Order' : 'Surat Jalan'}</span>
              )}
            </span>
            {duplicatingFrom && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                Duplicated from <span className="font-semibold">{duplicatingFrom.item_name}</span> — modify as needed.
              </div>
            )}
          </div>

          {isDO && orderId ? (
            <div>
              <OrderItemSelect
                items={remainingItems}
                value={quickAdd.item_name ? { item_name: quickAdd.item_name, size: quickAdd.size || null } : null}
                onSelect={match => setQuickAdd(p => ({
                  ...p,
                  item_name: match?.item_name ?? '',
                  size: match?.size ?? '',
                  amount: match ? Math.min(p.amount || 1, match.remaining) || 1 : p.amount,
                }))}
                missing={missing}
                label="Item Name"
              />
              <FieldHint />
            </div>
          ) : (
            <FormField label={isDO ? 'Item Name' : 'Document Name'} required>
              <input
                className={`field ${missing ? '!border-red-400 !ring-red-100' : ''}`}
                placeholder={isDO ? 'e.g. Kemeja Server' : 'e.g. Invoice, Mock Up'}
                value={quickAdd.item_name}
                onChange={e => setQuickAdd(p => ({ ...p, item_name: e.target.value.toUpperCase() }))}
              />
              <FieldHint />
            </FormField>
          )}

          {isDO && !orderId && (
            <FormField label="Size">
              <input className="field" placeholder="e.g. S, M, L" value={quickAdd.size}
                onChange={e => setQuickAdd(p => ({ ...p, size: e.target.value.toUpperCase() }))} />
              <FieldHint />
            </FormField>
          )}

          <FormField label="Amount" required>
            <input className="field" type="number" min={1} max={maxAmount ?? undefined} value={quickAdd.amount || ''}
              onChange={e => {
                const val = Number(e.target.value)
                setQuickAdd(p => ({ ...p, amount: maxAmount != null ? Math.min(val, maxAmount) : val }))
              }} />
            <FieldHint>{maxAmount != null ? `Max ${maxAmount} available` : undefined}</FieldHint>
          </FormField>

          <FormField label={isDO ? 'Box Number' : 'Package Code (Kode Paket)'}>
            <input className="field" type="number" min={1} value={quickAdd.box_number ?? ''}
              placeholder="e.g. 1, 2, 3"
              onChange={e => setQuickAdd(p => ({ ...p, box_number: Number(e.target.value) || null }))} />
            <FieldHint />
          </FormField>

          <div className="flex flex-col justify-end">
            <button className="btn-primary w-full" disabled={create.isPending} onClick={handleAdd}>
              {create.isPending ? 'Adding…' : isDO ? 'Add Item' : 'Add Document'}
            </button>
            <FieldHint />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {items.length === 0 && (
            <div className="card p-10 text-center text-slate-400 text-sm">
              No {isDO ? 'items' : 'documents'} yet for <span className="font-mono">{deliveryId}</span> — add one above.
            </div>
          )}

          {isDO && recap.length > 0 && (
            <div className="card border-2 border-navy-100">
              <div className="flex items-center justify-between px-4 py-2.5 bg-navy-50 border-b border-navy-100">
                <h3 className="font-semibold text-navy-900 text-sm">Recap — All Boxes</h3>
                <span className="text-xs text-navy-500">{boxGroups.length} box{boxGroups.length !== 1 ? 'es' : ''} · {recap.reduce((s, r) => s + r.total, 0)} pcs total</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                    <th className="text-left p-3">Item</th>
                    <th className="text-left p-3">Size</th>
                    <th className="text-right p-3">Total Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.map(r => (
                    <tr key={`${r.item_name}|${r.size ?? ''}`} className="border-b border-slate-50 last:border-0">
                      <td className="p-3 font-medium">{r.item_name}</td>
                      <td className="p-3">{r.size ?? '—'}</td>
                      <td className="p-3 text-right font-mono font-semibold">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isDO ? (
            boxGroups.map(([boxKey, boxItems], i) => {
              const boxTotal = boxItems.reduce((s, it) => s + it.amount, 0)
              const badgeColor = boxKey === 'unassigned' ? 'bg-slate-400' : BOX_BADGE_COLORS[i % BOX_BADGE_COLORS.length]
              return (
                <div key={boxKey} className="rounded-xl border-2 border-slate-200 overflow-hidden">
                  <div className={`flex items-center justify-between px-4 py-2.5 text-white ${badgeColor}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 font-bold text-xs shrink-0">
                        {boxKey === 'unassigned' ? <Box size={14} /> : boxKey}
                      </span>
                      <h3 className="font-semibold text-sm">
                        {boxKey === 'unassigned' ? 'No Box Assigned' : `Box ${boxKey}`}
                      </h3>
                    </div>
                    <span className="text-xs text-white/80">{boxItems.length} item{boxItems.length !== 1 ? 's' : ''} · {boxTotal} pcs</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 bg-slate-50">
                        <th className="text-left p-3">Item</th>
                        <th className="text-left p-3">Size</th>
                        <th className="text-right p-3">Amount</th>
                        <th className="text-right p-3">Box</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {boxItems.map(item => (
                        <DeliveryItemRow
                          key={item.id}
                          item={item}
                          isDO={isDO}
                          orderId={orderId}
                          onFullEdit={setEditingItem}
                          onDuplicate={openDuplicate}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })
          ) : items.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-navy-900 text-sm">Documents</h3>
                <span className="text-xs text-slate-400">{items.length} document{items.length !== 1 ? 's' : ''}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                    <th className="text-left p-3">Document</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-right p-3">Package</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <DeliveryItemRow
                      key={item.id}
                      item={item}
                      isDO={isDO}
                      orderId={orderId}
                      onFullEdit={setEditingItem}
                      onDuplicate={openDuplicate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editingItem && (
        <Modal title="Change Item" onClose={() => setEditingItem(null)}>
          <DeliveryOrderForm editing={editingItem} onClose={() => setEditingItem(null)} />
        </Modal>
      )}
    </div>
  )
}

// A single item row in the box-grouped/flat table. Amount and Box Number
// edit inline (click the pencil, Save/Cancel replace it) — that's the
// common correction after physical packing. Changing the item itself
// (name/size) goes through the full modal, since re-picking from the
// order's item list is a bigger change than fixing a quantity. Duplicate
// prefills the quick-add panel above instead of a separate form.
function DeliveryItemRow({
  item,
  isDO,
  orderId,
  onFullEdit,
  onDuplicate,
}: {
  item: DeliveryItem
  isDO: boolean
  orderId: string | null
  onFullEdit: (item: DeliveryItem) => void
  onDuplicate: (item: DeliveryItem) => void
}) {
  const update = deliveryItemHooks.useUpdate()
  const del = deliveryItemHooks.useDelete()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(item.amount)
  const [box_number, setBoxnumber] = useState(item.box_number)
  // Excludes this item's own current amount so editing it doesn't count
  // against its own headroom.
  const remainingItems = useOrderRemainingItems(orderId, item.id)
  const maxAmount = orderId
    ? (remainingItems.find(r => r.item_name === item.item_name && (r.size ?? '') === (item.size ?? ''))?.remaining ?? null)
    : null

  const startEdit = () => { setAmount(item.amount); setBoxnumber(item.box_number); setEditing(true) }
  const cancelEdit = () => setEditing(false)
  const save = () => {
    if (maxAmount != null && amount > maxAmount) {
      toast.error(`Only ${maxAmount} left for this item`)
      return
    }
    update.mutate({ id: item.id, body: { amount, box_number } }, { onSuccess: () => setEditing(false) })
  }

  if (editing) {
    return (
      <tr className="border-b border-slate-50 bg-navy-50/40">
        <td className="p-3 font-medium">{item.item_name}</td>
        {isDO && <td className="p-3">{item.size ?? '—'}</td>}
        <td className="p-2 text-right">
          <input
            type="number" min={1} max={maxAmount ?? undefined} autoFocus
            className="field text-right w-20 ml-auto"
            value={amount}
            onChange={e => {
              const val = Number(e.target.value)
              setAmount(maxAmount != null ? Math.min(val, maxAmount) : val)
            }}
          />
        </td>
        <td className="p-2 text-right">
          <input
            type="number" min={1}
            className="field text-right w-20 ml-auto"
            placeholder="—"
            value={box_number ?? ''}
            onChange={e => setBoxnumber(Number(e.target.value) || null)}
          />
        </td>
        <td className="p-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button className="text-green-600 hover:text-green-700" title="Save" disabled={update.isPending} onClick={save}>
              <Check size={16} />
            </button>
            <button className="text-slate-400 hover:text-red-500" title="Cancel" onClick={cancelEdit}>
              <X size={16} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50">
      <td className="p-3 font-medium">{item.item_name}</td>
      {isDO && <td className="p-3">{item.size ?? '—'}</td>}
      <td className="p-3 text-right">{item.amount}</td>
      <td className="p-3 text-right font-mono text-slate-400">{item.box_number ?? '—'}</td>
      <td className="p-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <button className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1" title="Duplicate"
            onClick={() => onDuplicate(item)}>
            <Copy size={12} /> Copy
          </button>
          <button className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1" title="Edit amount / box"
            onClick={startEdit}>
            <Pencil size={12} /> Edit
          </button>
          <button className="text-slate-400 hover:text-navy-600 text-xs" title="Change item"
            onClick={() => onFullEdit(item)}>
            Change item
          </button>
          <button className="text-slate-400 hover:text-red-500 text-xs"
            onClick={() => del.mutate(item.id)}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}

// Edit-only form, used inside the "Change Item" modal above. Delivery ID is
// fixed once an item exists (you don't move an item to a different
// delivery from here).
function DeliveryOrderForm({ editing, onClose }: { editing: DeliveryItem; onClose: () => void }) {
  const update = deliveryItemHooks.useUpdate()
  const { data: deliveries = [] } = deliveryHooks.useList()
  const delivery = deliveries.find(d => d.id === editing.delivery_id)
  const isDO = (delivery?.type ?? 'DO') === 'DO'
  const orderId = delivery?.order_id ?? null
  // Excludes this item's own amount from "already delivered" so editing it
  // doesn't count against its own headroom.
  const remainingItems = useOrderRemainingItems(orderId, editing.id)

  const [form, setForm] = useState<CreateDeliveryItemRequest>({
    delivery_id: editing.delivery_id,
    item_name:   editing.item_name,
    size:        editing.size ?? '',
    amount:      editing.amount,
    box_number:   editing.box_number ?? null,
  })

  const selectedOrderItem = orderId
    ? remainingItems.find(r => r.item_name === form.item_name && (r.size ?? '') === (form.size ?? ''))
    : undefined
  const maxAmount = selectedOrderItem ? selectedOrderItem.remaining : null

  const handleSubmit = () => {
    if (maxAmount != null && form.amount > maxAmount) {
      toast.error(`Only ${maxAmount} left for this item`)
      return
    }
    const payload = { ...form, size: form.size || null }
    update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
  }

  return (
    <div className="space-y-4">
      <FormField label="Delivery">
        <input className="field font-mono bg-slate-50" readOnly value={form.delivery_id} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        {isDO && orderId ? (
          <div className="col-span-2">
            <OrderItemSelect
              items={remainingItems}
              value={{ item_name: form.item_name, size: form.size || null }}
              onSelect={match => setForm(p => ({
                ...p,
                item_name: match?.item_name ?? '',
                size: match?.size ?? '',
              }))}
              label="Item Name"
            />
          </div>
        ) : (
          <>
            <FormField label={isDO ? 'Item Name' : 'Document Name'} required>
              <input className="field" value={form.item_name}
                onChange={e => setForm(p => ({ ...p, item_name: e.target.value.toUpperCase() }))} />
            </FormField>
            {isDO && (
              <FormField label="Size">
                <input className="field" placeholder="S / M / L / XL" value={form.size ?? ''}
                  onChange={e => setForm(p => ({ ...p, size: e.target.value.toUpperCase() }))} />
              </FormField>
            )}
          </>
        )}
        <FormField label="Amount" required>
          <input className="field" type="number" min={1} max={maxAmount ?? undefined} value={form.amount}
            onChange={e => {
              const val = Number(e.target.value)
              setForm(p => ({ ...p, amount: maxAmount != null ? Math.min(val, maxAmount) : val }))
            }} />
          {maxAmount != null && (
            <p className="text-xs text-slate-400 mt-1">Max {maxAmount} available</p>
          )}
        </FormField>
        <FormField label={isDO ? 'Box Number' : 'Package Code (Kode Paket)'}>
          <input className="field" type="number" min={1} value={form.box_number ?? ''}
            onChange={e => setForm(p => ({ ...p, box_number: Number(e.target.value) || null }))} />
        </FormField>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={update.isPending} onClick={handleSubmit}>
          {update.isPending ? 'Saving…' : 'Update'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}