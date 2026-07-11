import { useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './index'

interface NewKasBonDateModalProps {
  headerId: string
  defaultDate: string
  onConfirm: (date: string) => void
  onCancel: () => void
}

/**
 * Shown once, right when a brand-new Kas Bon ID is typed into a spreadsheet's
 * blank row. There's no per-row Date column — date lives on the shared
 * FinanceHeader, not on each item — so this is the one moment a date
 * actually needs to be captured. Description is captured inline as a
 * normal column instead (typed before this even fires, since it sits to
 * the left of the trigger column in the table). Adding another item to an
 * *existing* Kas Bon never triggers this modal at all.
 */
export function NewKasBonDateModal({ headerId, defaultDate, onConfirm, onCancel }: NewKasBonDateModalProps) {
  const [date, setDate] = useState(defaultDate)

  return (
    <Modal title={`New Kas Bon — ${headerId}`} onClose={onCancel} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          This Kas Bon ID doesn't exist yet — what date should it be recorded under?
        </p>
        <FormField label="Date" required>
          <input
            className="field"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            autoFocus
          />
        </FormField>
        <div className="flex gap-2 justify-end pt-1">
          <button className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!date} onClick={() => onConfirm(date)}>
            Create Kas Bon
          </button>
        </div>
      </div>
    </Modal>
  )
}