// ─── Supplier category enum from kma.yaml ────────────────────────────────────
export type SupplierCategory =
  | 'sablon'
  | 'embroidery'
  | 'merchandise_supplier'
  | 'uniform_supplier'
  | 'general_supplier'

// ─── Matches dto/Supplier.go ──────────────────────────────────────────────────
export interface Supplier {
  id: number
  supplier_name: string
  supplier_category: SupplierCategory
}

// ─── Matches dto/SupplierMaterial.go ──────────────────────────────────────────
// A material in a supplier's own catalogue, editable from the Suppliers page.
export interface SupplierMaterial {
  id: number
  supplier_id: number
  name: string
  brand: string | null
  composition: string | null
  used_for: string | null
  width_cm: number | null
  roll_yards: number | null
  /** The current price per unit — a single live figure, not a year-by-year
   *  history like ClientItemPrice. */
  price: number
}

// ─── Matches dto/SupplierMaterialColor.go ─────────────────────────────────────
export interface SupplierMaterialColor {
  id: number
  supplier_material_id: number
  code: string
  category: string | null
  hex: string
}

// ─── Matches dto/SupplierDocument.go ───────────────────────────────────────────
// A supplier's own catalogue or price-list PDF — a supplier can have several
// (POST adds, it never replaces).
export interface SupplierDocument {
  id: number
  supplier_id: number
  file_name: string
  file_path: string
  uploaded_at: string
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateSupplierRequest = Omit<Supplier, 'id'>
export type UpdateSupplierRequest = Partial<CreateSupplierRequest>

export type CreateSupplierMaterialRequest = Omit<SupplierMaterial, 'id'>
export type UpdateSupplierMaterialRequest = Partial<Omit<SupplierMaterial, 'id' | 'supplier_id'>>

export type CreateSupplierMaterialColorRequest = Omit<SupplierMaterialColor, 'id'>
export type UpdateSupplierMaterialColorRequest = Partial<Omit<SupplierMaterialColor, 'id' | 'supplier_material_id'>>
