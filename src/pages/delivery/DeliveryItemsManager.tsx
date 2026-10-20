import { useState, useMemo } from 'react'
import { Plus, Pencil, Check, X, Copy, Box } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog, FormField } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useIsMobile } from '@/hooks/useIsMobile'
import { deliveryHooks, deliveryItemHooks, useOrderRemainingItems } from '@/hooks'
import { OrderItemSelect } from './DeliveryOrderItemSelect'
import type { DeliveryItem, CreateDeliveryItemRequest } from '@/types'

// Adding, editing and viewing one delivery's items (DeliveryDetailPage):
// fill the boxes with what the client ordered, then print.

const emptyQuickAddItem = () => ({ item_name: '', size: '', amount: 1, box_number: null as number | null })

// Alternating badge colors just to make adjacent boxes visually distinct at
// a glance when scrolling a long list — the number itself is still the
// source of truth, this is purely a scan-ability aid. Tinted rather than
// solid everywhere (desktop used to get solid bars; a row of six different
// saturated colors stacked down the page read as noisy, and the tinted
// version already read calmer on phones).
const BOX_BADGE_COLORS_LIGHT = [
  'bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-200',
  'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400',
  'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
]

// A fixed-height hint line under every field, so rows line up whether or not
// a hint shows.
function FieldHint({ children }: { children?: React.ReactNode }) {
  return <p className="text-xs text-slate-400 mt-1 h-4 leading-4 dark:text-slate-500">{children ?? '\u00A0'}</p>
}

interface DeliveryItemsManagerProps {
  deliveryId: string
}

export function DeliveryItemsManager({ deliveryId }: DeliveryItemsManagerProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  // A failed fetch blocks the form: otherwise it would quietly lose the order's
  // "max remaining" limits.
  const { data: deliveries = [], isError: isDeliveriesError } = deliveryHooks.useList()
  const { data: allItems = [], isLoading, isError: isItemsError, refetch } = deliveryItemHooks.useList()
  const isError = isDeliveriesError || isItemsError
  const create = deliveryItemHooks.useCreate()
  const del = deliveryItemHooks.useDelete()

  const [open, setOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(emptyQuickAddItem())
  const [missing, setMissing] = useState(false)
  const [duplicatingFrom, setDuplicatingFrom] = useState<DeliveryItem | null>(null)
  const [editingItem, setEditingItem] = useState<DeliveryItem | null>(null)
  // Confirm-before-delete for every item row — see DeliveryItemRow's own
  // onRequestDelete comment for why this lives here instead of per-row.
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<DeliveryItem | null>(null)

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
      toast.error(t('delivery.items.itemNameRequired'))
      return
    }
    if (maxAmount != null && quickAdd.amount > maxAmount) {
      toast.error(t('delivery.items.onlyMaxLeft', { max: maxAmount }))
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
      <div className="card p-10 text-center text-slate-400 text-sm dark:text-slate-500">
        {t('delivery.items.deliveryNotFound')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-navy-900 text-sm dark:text-slate-50">
          {isDO ? t('delivery.items.boxContents', { count: items.length }) : t('delivery.items.documents', { count: items.length })}
        </h2>
        <button className="btn-primary flex items-center gap-1 !py-1.5 text-sm" onClick={open ? () => setOpen(false) : openAdd}>
          <Plus size={14} /> {isDO ? t('delivery.items.addItem') : t('delivery.items.addDocument')}
        </button>
      </div>

      {/* On phones the form opens as a popup instead of pushing the lists down. */}
      {open && isMobile && (
        <Modal
          title={isDO ? (duplicatingFrom ? t('delivery.items.duplicateItem') : t('delivery.items.addItem')) : (duplicatingFrom ? t('delivery.items.duplicateDocument') : t('delivery.items.addDocument'))}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 border border-navy-100 rounded-full px-2.5 py-1 dark:bg-navy-800 dark:text-navy-200 dark:border-navy-700">
                {t('delivery.items.addingTo')} <span className="font-mono font-semibold">{deliveryId}</span>
                {selectedDelivery && (
                  <span className="text-navy-400 font-normal"> · {isDO ? t('delivery.deliveryOrder') : t('delivery.suratJalan')}</span>
                )}
              </span>
              {duplicatingFrom && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400">
                  {t('delivery.items.duplicatedFrom', { name: duplicatingFrom.item_name })}
                </div>
              )}
            </div>

            {isDO && orderId ? (
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
                label={t('delivery.items.itemName')}
              />
            ) : (
              <FormField label={isDO ? t('delivery.items.itemName') : t('delivery.items.documentName')} required>
                <input
                  className={`field ${missing ? '!border-red-400 !ring-red-100 dark:!border-red-500 dark:!ring-red-500/20' : ''}`}
                  placeholder={isDO ? t('delivery.items.itemNamePlaceholder') : t('delivery.items.documentNamePlaceholder')}
                  value={quickAdd.item_name}
                  onChange={e => setQuickAdd(p => ({ ...p, item_name: e.target.value.toUpperCase() }))}
                />
              </FormField>
            )}

            {isDO && !orderId && (
              <FormField label={t('delivery.items.size')}>
                <input className="field" placeholder={t('delivery.items.sizePlaceholder')} value={quickAdd.size}
                  onChange={e => setQuickAdd(p => ({ ...p, size: e.target.value.toUpperCase() }))} />
              </FormField>
            )}

            <FormField label={t('delivery.items.amount')} required>
              <input className="field" type="number" min={1} max={maxAmount ?? undefined} value={quickAdd.amount || ''}
                onChange={e => {
                  const val = Number(e.target.value)
                  setQuickAdd(p => ({ ...p, amount: maxAmount != null ? Math.min(val, maxAmount) : val }))
                }} />
              {maxAmount != null && <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">{t('delivery.items.maxAvailable', { max: maxAmount })}</p>}
            </FormField>

            <FormField label={isDO ? t('delivery.items.boxNumber') : t('delivery.items.packageCode')}>
              <input className="field" type="number" min={1} value={quickAdd.box_number ?? ''}
                placeholder={t('delivery.items.boxNumberPlaceholder')}
                onChange={e => setQuickAdd(p => ({ ...p, box_number: Number(e.target.value) || null }))} />
            </FormField>

            <button className="btn-primary w-full" disabled={create.isPending} onClick={handleAdd}>
              {create.isPending ? t('delivery.items.adding') : isDO ? t('delivery.items.addItem') : t('delivery.items.addDocument')}
            </button>
            <p className="text-xs text-slate-400 text-center dark:text-slate-500">
              {t('delivery.items.stayOpenHint', { thing: isDO ? t('delivery.items.item') : t('delivery.items.document') })}
            </p>
          </div>
        </Modal>
      )}

      {open && !isMobile && (
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-navy-950">
          <div className="col-span-1 sm:col-span-2 md:col-span-4 -mb-1 space-y-2">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t('delivery.items.addingToThisDeliveryStayOpenHint', { thing: isDO ? t('delivery.items.item') : t('delivery.items.document') })}
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 border border-navy-100 rounded-full px-2.5 py-1 dark:bg-navy-800 dark:text-navy-200 dark:border-navy-700">
              {t('delivery.items.addingTo')} <span className="font-mono font-semibold">{deliveryId}</span>
              {selectedDelivery && (
                <span className="text-navy-400 font-normal"> · {isDO ? t('delivery.deliveryOrder') : t('delivery.suratJalan')}</span>
              )}
            </span>
            {duplicatingFrom && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400">
                {t('delivery.items.duplicatedFrom', { name: duplicatingFrom.item_name })}
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
                label={t('delivery.items.itemName')}
              />
              <FieldHint />
            </div>
          ) : (
            <FormField label={isDO ? t('delivery.items.itemName') : t('delivery.items.documentName')} required>
              <input
                className={`field ${missing ? '!border-red-400 !ring-red-100 dark:!border-red-500 dark:!ring-red-500/20' : ''}`}
                placeholder={isDO ? t('delivery.items.itemNamePlaceholder') : t('delivery.items.documentNamePlaceholder')}
                value={quickAdd.item_name}
                onChange={e => setQuickAdd(p => ({ ...p, item_name: e.target.value.toUpperCase() }))}
              />
              <FieldHint />
            </FormField>
          )}

          {isDO && !orderId && (
            <FormField label={t('delivery.items.size')}>
              <input className="field" placeholder={t('delivery.items.sizePlaceholder')} value={quickAdd.size}
                onChange={e => setQuickAdd(p => ({ ...p, size: e.target.value.toUpperCase() }))} />
              <FieldHint />
            </FormField>
          )}

          <FormField label={t('delivery.items.amount')} required>
            <input className="field" type="number" min={1} max={maxAmount ?? undefined} value={quickAdd.amount || ''}
              onChange={e => {
                const val = Number(e.target.value)
                setQuickAdd(p => ({ ...p, amount: maxAmount != null ? Math.min(val, maxAmount) : val }))
              }} />
            <FieldHint>{maxAmount != null ? t('delivery.items.maxAvailable', { max: maxAmount }) : undefined}</FieldHint>
          </FormField>

          <FormField label={isDO ? t('delivery.items.boxNumber') : t('delivery.items.packageCode')}>
            <input className="field" type="number" min={1} value={quickAdd.box_number ?? ''}
              placeholder={t('delivery.items.boxNumberPlaceholder')}
              onChange={e => setQuickAdd(p => ({ ...p, box_number: Number(e.target.value) || null }))} />
            <FieldHint />
          </FormField>

          <div className="flex flex-col justify-end">
            <button className="btn-primary w-full" disabled={create.isPending} onClick={handleAdd}>
              {create.isPending ? t('delivery.items.adding') : isDO ? t('delivery.items.addItem') : t('delivery.items.addDocument')}
            </button>
            <FieldHint />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-slate-400 text-sm dark:text-slate-500">{t('common.loading')}</div>
      ) : isError ? (
        // A failed fetch shows Retry, not "nothing here".
        <div className="card p-10 text-center text-sm">
          <p className="text-red-400 mb-3">{t('common.couldntLoad', { what: isDO ? t('delivery.items.itemsPlural') : t('delivery.items.documentsPlural') })}</p>
          <button onClick={() => refetch()} className="btn-secondary">{t('common.retry')}</button>
        </div>
      ) : (
        <>
          {items.length === 0 && (
            <div className="card p-10 text-center text-slate-400 text-sm dark:text-slate-500">
              {isDO
                ? t('delivery.items.noItemsYet', { id: deliveryId })
                : t('delivery.items.noDocumentsYet', { id: deliveryId })}
            </div>
          )}

          {isDO && recap.length > 0 && (
            <div className="card border-navy-100 dark:border-navy-700">
              <div className="flex items-center justify-between px-4 py-3 bg-navy-50 border-b border-navy-100 gap-2 flex-wrap dark:bg-navy-800 dark:border-navy-700">
                <h3 className="font-semibold text-navy-900 text-sm dark:text-slate-50">{t('delivery.items.recapAllBoxes')}</h3>
                <span className="text-xs text-navy-500">{t('delivery.items.boxCount', { count: boxGroups.length })} · {t('common.pcs', { count: recap.reduce((s, r) => s + r.total, 0) })}</span>
              </div>
              {isMobile ? (
                // Phone width: label: value cards instead of a 3-column table.
                <div className="divide-y divide-slate-50 dark:divide-navy-800/60">
                  {recap.map(r => (
                    <div key={`${r.item_name}|${r.size ?? ''}`} className="flex items-center justify-between gap-3 p-4">
                      <span className="font-medium">{r.item_name}{r.size ? ` · ${r.size}` : ''}</span>
                      <span className="font-mono font-semibold shrink-0">{r.total}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:text-slate-500 dark:border-navy-800">
                        <th className="text-left p-3">{t('delivery.items.itemHeader')}</th>
                        <th className="text-left p-3">{t('delivery.items.sizeHeader')}</th>
                        <th className="text-right p-3">{t('delivery.items.totalQty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recap.map(r => (
                        <tr key={`${r.item_name}|${r.size ?? ''}`} className="border-b border-slate-50 last:border-0 dark:border-navy-800/60">
                          <td className="p-3 font-medium">{r.item_name}</td>
                          <td className="p-3">{r.size ?? '—'}</td>
                          <td className="p-3 text-right font-mono font-semibold">{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {isDO ? (
            boxGroups.map(([boxKey, boxItems], i) => {
              const boxTotal = boxItems.reduce((s, it) => s + it.amount, 0)
              const badgeColorLight = boxKey === 'unassigned' ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' : BOX_BADGE_COLORS_LIGHT[i % BOX_BADGE_COLORS_LIGHT.length]
              return (
                <div key={boxKey} className="rounded-xl overflow-hidden border border-slate-200 dark:border-navy-700">
                  <div className={`flex items-center justify-between px-4 py-3 gap-2 flex-wrap ${badgeColorLight}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/60 font-bold text-xs shrink-0 dark:bg-navy-950/40">
                        {boxKey === 'unassigned' ? <Box size={14} /> : boxKey}
                      </span>
                      <h3 className="font-semibold text-sm">
                        {boxKey === 'unassigned' ? t('delivery.items.noBoxAssigned') : t('delivery.items.box', { number: boxKey })}
                      </h3>
                    </div>
                    <span className="text-xs opacity-70">{t('delivery.items.itemCount', { count: boxItems.length })} · {t('common.pcs', { count: boxTotal })}</span>
                  </div>
                  {isMobile ? (
                    <div className="divide-y divide-slate-50 dark:divide-navy-800/60">
                      {boxItems.map(item => (
                        <DeliveryItemRow
                          key={item.id}
                          item={item}
                          isDO={isDO}
                          isMobile
                          orderId={orderId}
                          onFullEdit={setEditingItem}
                          onDuplicate={openDuplicate}
                          onRequestDelete={setConfirmDeleteItem}
                        />
                      ))}
                    </div>
                  ) : (
                    // Only the table scrolls, so the action buttons stay reachable on phones.
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[560px]">
                        <thead>
                          <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 bg-slate-50 dark:text-slate-500 dark:border-navy-800 dark:bg-navy-950">
                            <th className="text-left p-3">{t('delivery.items.itemHeader')}</th>
                            <th className="text-left p-3">{t('delivery.items.sizeHeader')}</th>
                            <th className="text-right p-3">{t('delivery.items.amountHeader')}</th>
                            <th className="text-right p-3">{t('delivery.items.boxHeader')}</th>
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
                              onRequestDelete={setConfirmDeleteItem}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          ) : items.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50 gap-2 flex-wrap dark:border-navy-800 dark:bg-navy-950">
                <h3 className="font-semibold text-navy-900 text-sm dark:text-slate-50">{t('delivery.items.documentsHeader')}</h3>
                <span className="text-xs text-slate-400 dark:text-slate-500">{t('delivery.items.documentsCount', { count: items.length })}</span>
              </div>
              {isMobile ? (
                <div className="divide-y divide-slate-50 dark:divide-navy-800/60">
                  {items.map(item => (
                    <DeliveryItemRow
                      key={item.id}
                      item={item}
                      isDO={isDO}
                      isMobile
                      orderId={orderId}
                      onFullEdit={setEditingItem}
                      onDuplicate={openDuplicate}
                      onRequestDelete={setConfirmDeleteItem}
                    />
                  ))}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:text-slate-500 dark:border-navy-800">
                      <th className="text-left p-3">{t('delivery.items.documentHeader')}</th>
                      <th className="text-right p-3">{t('delivery.items.amountHeader')}</th>
                      <th className="text-right p-3">{t('delivery.items.packageHeader')}</th>
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
                        onRequestDelete={setConfirmDeleteItem}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </>
      )}

      {editingItem && (
        <Modal title={t('delivery.items.changeItemModalTitle')} onClose={() => setEditingItem(null)}>
          <DeliveryOrderForm editing={editingItem} onClose={() => setEditingItem(null)} />
        </Modal>
      )}

      {confirmDeleteItem && (
        <ConfirmDialog
          message={t('delivery.items.deleteConfirm', {
            name: `${confirmDeleteItem.item_name}${confirmDeleteItem.size ? ` (${confirmDeleteItem.size})` : ''}`,
            context: isDO ? t('delivery.items.deliveryContext') : t('delivery.items.documentListContext'),
          })}
          onConfirm={() => { del.mutate(confirmDeleteItem.id); setConfirmDeleteItem(null) }}
          onCancel={() => setConfirmDeleteItem(null)}
        />
      )}
    </div>
  )
}

// One item row. Amount and box number edit inline; changing the item opens
// the full form; Duplicate prefills the quick-add panel.
function DeliveryItemRow({
  item,
  isDO,
  isMobile = false,
  orderId,
  onFullEdit,
  onDuplicate,
  onRequestDelete,
}: {
  item: DeliveryItem
  isDO: boolean
  isMobile?: boolean
  orderId: string | null
  onFullEdit: (item: DeliveryItem) => void
  onDuplicate: (item: DeliveryItem) => void
  // The parent owns the confirm dialog (a dialog can't sit next to a <tr>).
  onRequestDelete: (item: DeliveryItem) => void
}) {
  const { t } = useTranslation()
  const update = deliveryItemHooks.useUpdate()
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
      toast.error(t('delivery.items.onlyMaxLeft', { max: maxAmount }))
      return
    }
    update.mutate({ id: item.id, body: { amount, box_number } }, { onSuccess: () => setEditing(false) })
  }

  if (editing) {
    if (isMobile) {
      // Labeled fields on the card, instead of the table's bare inputs.
      return (
        <div className="p-4 bg-navy-50/40 dark:bg-navy-800/40">
          <div className="font-medium mb-3">{item.item_name}{isDO && item.size ? ` · ${item.size}` : ''}</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <FormField label={t('delivery.items.amount')}>
              <input
                type="number" min={1} max={maxAmount ?? undefined} autoFocus
                className="field"
                value={amount}
                onChange={e => {
                  const val = Number(e.target.value)
                  setAmount(maxAmount != null ? Math.min(val, maxAmount) : val)
                }}
              />
            </FormField>
            <FormField label={isDO ? t('delivery.items.boxLabel') : t('delivery.items.packageLabel')}>
              <input
                type="number" min={1}
                className="field"
                placeholder="—"
                value={box_number ?? ''}
                onChange={e => setBoxnumber(Number(e.target.value) || null)}
              />
            </FormField>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary btn-sm flex items-center gap-1" disabled={update.isPending} onClick={save}>
              <Check size={14} /> {t('delivery.items.save')}
            </button>
            <button className="btn-secondary btn-sm flex items-center gap-1" onClick={cancelEdit}>
              <X size={14} /> {t('delivery.items.cancel')}
            </button>
          </div>
        </div>
      )
    }
    return (
      <tr className="border-b border-slate-50 bg-navy-50/40 dark:border-navy-800/60 dark:bg-navy-800/40">
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
            <button className="text-green-600 hover:text-green-700 dark:text-green-400" title={t('delivery.items.save')} disabled={update.isPending} onClick={save}>
              <Check size={16} />
            </button>
            <button className="text-slate-400 hover:text-red-500 dark:text-slate-500" title={t('delivery.items.cancel')} onClick={cancelEdit}>
              <X size={16} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  if (isMobile) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{item.item_name}{isDO && item.size ? ` · ${item.size}` : ''}</span>
          <span className="font-mono font-semibold shrink-0">{item.amount}</span>
        </div>
        <div className="text-xs text-slate-400 mt-1 dark:text-slate-500">
          {isDO ? t('delivery.items.boxColon', { number: item.box_number ?? '—' }) : t('delivery.items.packageColon', { number: item.box_number ?? '—' })}
        </div>
        {/* Roomier actions: the row people tap most on a phone. */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <button className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1.5 dark:text-slate-500" title={t('delivery.items.duplicateTooltip')}
            onClick={() => onDuplicate(item)}>
            <Copy size={14} /> {t('delivery.items.copy')}
          </button>
          <button className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1.5 dark:text-slate-500" title={t('delivery.items.editTooltip')}
            onClick={startEdit}>
            <Pencil size={14} /> {t('delivery.items.edit')}
          </button>
          <button className="text-slate-400 hover:text-navy-600 text-xs dark:text-slate-500" title={t('delivery.items.changeItemTooltip')}
            onClick={() => onFullEdit(item)}>
            {t('delivery.items.changeItem')}
          </button>
          <button className="text-slate-400 hover:text-red-500 text-xs dark:text-slate-500"
            onClick={() => onRequestDelete(item)}>
            {t('delivery.items.delete')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50 dark:border-navy-800/60 dark:hover:bg-white/5">
      <td className="p-3 font-medium">{item.item_name}</td>
      {isDO && <td className="p-3">{item.size ?? '—'}</td>}
      <td className="p-3 text-right">{item.amount}</td>
      <td className="p-3 text-right font-mono text-slate-400 dark:text-slate-500">{item.box_number ?? '—'}</td>
      <td className="p-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <button className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1 dark:text-slate-500" title={t('delivery.items.duplicateTooltip')}
            onClick={() => onDuplicate(item)}>
            <Copy size={12} /> {t('delivery.items.copy')}
          </button>
          <button className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1 dark:text-slate-500" title={t('delivery.items.editTooltip')}
            onClick={startEdit}>
            <Pencil size={12} /> {t('delivery.items.edit')}
          </button>
          <button className="text-slate-400 hover:text-navy-600 text-xs dark:text-slate-500" title={t('delivery.items.changeItemTooltip')}
            onClick={() => onFullEdit(item)}>
            {t('delivery.items.changeItem')}
          </button>
          <button className="text-slate-400 hover:text-red-500 text-xs dark:text-slate-500"
            onClick={() => onRequestDelete(item)}>
            {t('delivery.items.delete')}
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
  const { t } = useTranslation()
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
      toast.error(t('delivery.items.onlyMaxLeft', { max: maxAmount }))
      return
    }
    const payload = { ...form, size: form.size || null }
    update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
  }

  return (
    <div className="space-y-4">
      <FormField label={t('delivery.items.deliveryReadOnly')}>
        <input className="field font-mono bg-slate-50 dark:bg-navy-950" readOnly value={form.delivery_id} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isDO && orderId ? (
          <div className="col-span-1 sm:col-span-2">
            <OrderItemSelect
              items={remainingItems}
              value={{ item_name: form.item_name, size: form.size || null }}
              onSelect={match => setForm(p => ({
                ...p,
                item_name: match?.item_name ?? '',
                size: match?.size ?? '',
              }))}
              label={t('delivery.items.itemName')}
            />
          </div>
        ) : (
          <>
            <FormField label={isDO ? t('delivery.items.itemName') : t('delivery.items.documentName')} required>
              <input className="field" value={form.item_name}
                onChange={e => setForm(p => ({ ...p, item_name: e.target.value.toUpperCase() }))} />
            </FormField>
            {isDO && (
              <FormField label={t('delivery.items.size')}>
                <input className="field" placeholder="S / M / L / XL" value={form.size ?? ''}
                  onChange={e => setForm(p => ({ ...p, size: e.target.value.toUpperCase() }))} />
              </FormField>
            )}
          </>
        )}
        <FormField label={t('delivery.items.amount')} required>
          <input className="field" type="number" min={1} max={maxAmount ?? undefined} value={form.amount}
            onChange={e => {
              const val = Number(e.target.value)
              setForm(p => ({ ...p, amount: maxAmount != null ? Math.min(val, maxAmount) : val }))
            }} />
          {maxAmount != null && (
            <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">{t('delivery.items.maxAvailable', { max: maxAmount })}</p>
          )}
        </FormField>
        <FormField label={isDO ? t('delivery.items.boxNumber') : t('delivery.items.packageCode')}>
          <input className="field" type="number" min={1} value={form.box_number ?? ''}
            onChange={e => setForm(p => ({ ...p, box_number: Number(e.target.value) || null }))} />
        </FormField>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={update.isPending} onClick={handleSubmit}>
          {update.isPending ? t('common.saving') : t('delivery.items.update')}
        </button>
        <button className="btn-secondary" onClick={onClose}>{t('delivery.items.cancel')}</button>
      </div>
    </div>
  )
}