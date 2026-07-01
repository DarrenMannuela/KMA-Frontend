import { ProductionSpreadsheet } from '@/components/layout/ProductionsSpreadsheet'

// ProductionPage now delegates entirely to the spreadsheet view — inline add,
// edit, and delete replace what the old modal-form CrudPage did. Keeping the
// same export name/path so routing and nav don't need to change.
export function ProductionPage() {
  return <ProductionSpreadsheet />
}