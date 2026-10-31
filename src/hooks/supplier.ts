import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { friendlyError } from '@/utils/friendlyError'
import { suppliersApi, supplierMaterialApi, supplierMaterialColorApi, supplierDocumentApi } from '@/api'
import { ALL_CATALOGUES, supplierCatalogueFromDb, type SupplierCatalogue } from '@/data/materialCatalogue'
import { makeCrudHooks } from './crud'

export const supplierHooks = makeCrudHooks('suppliers', suppliersApi, 'Supplier')

// A supplier's own catalogue — same shape as clientItemHooks/
// clientItemPriceHooks. useGrouped() loads every supplier's colours in one
// request, the way the Kas Bon picker needs them merged across suppliers
// (see useSupplierCatalogues below).
export const supplierMaterialHooks = {
  ...makeCrudHooks('supplier-materials', supplierMaterialApi, 'Material'),
  useBySupplier: (supplierId: number | undefined) =>
    useQuery({
      queryKey: ['supplier-materials', 'by-supplier', supplierId],
      queryFn: () => supplierMaterialApi.getBySupplier(supplierId as number),
      enabled: supplierId !== undefined,
    }),
}

export const supplierMaterialColorHooks = {
  ...makeCrudHooks('supplier-material-colors', supplierMaterialColorApi, 'Colour'),
  useByMaterial: (materialId: number | undefined) =>
    useQuery({
      queryKey: ['supplier-material-colors', 'by-material', materialId],
      queryFn: () => supplierMaterialColorApi.getByMaterial(materialId as number),
      enabled: materialId !== undefined,
    }),
  useGrouped: () =>
    useQuery({ queryKey: ['supplier-material-colors', 'grouped'], queryFn: supplierMaterialColorApi.grouped }),
}

// A supplier's catalogue/price-list PDFs — separate from the structured
// materials above, and simpler: no shared CRUD factory, since there's no
// generic "update" (a document is only ever uploaded or removed).
export const supplierDocumentHooks = {
  useBySupplier: (supplierId: number | undefined) =>
    useQuery({
      queryKey: ['supplier-documents', 'by-supplier', supplierId],
      queryFn: () => supplierDocumentApi.getBySupplier(supplierId as number),
      enabled: supplierId !== undefined,
    }),
  useUpload: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ supplierId, file }: { supplierId: number; file: File }) => supplierDocumentApi.upload(supplierId, file),
      onSuccess: (_, { supplierId }) => {
        qc.invalidateQueries({ queryKey: ['supplier-documents', 'by-supplier', supplierId] })
        toast.success('Document uploaded')
      },
      onError: (e: Error) => toast.error(friendlyError(e)),
    })
  },
  useDelete: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id }: { id: number; supplierId: number }) => supplierDocumentApi.delete(id),
      onSuccess: (_, { supplierId }) => {
        qc.invalidateQueries({ queryKey: ['supplier-documents', 'by-supplier', supplierId] })
        toast.success('Document removed')
      },
      onError: (e: Error) => toast.error(friendlyError(e)),
    })
  },
}

/** Every pickable catalogue — one per supplier that has database-backed
 *  materials (see supplierCatalogueFromDb) — merged for the Kas Bon colour
 *  picker and the Ledger's own swatch, so either reads any supplier's
 *  catalogue the same way. Loads all suppliers' materials/colours up front
 *  (same "whole list in memory" pattern productionHooks/operationHooks
 *  already use for the Ledger) rather than per-row, since a Kas Bon can
 *  have lines across several suppliers. */
export function useSupplierCatalogues(): SupplierCatalogue[] {
  const { data: suppliers = [] } = supplierHooks.useList()
  const { data: materials = [] } = supplierMaterialHooks.useList()
  const { data: colorsByMaterial = {} } = supplierMaterialColorHooks.useGrouped()
  return useMemo(() => {
    const bySupplier = new Map<number, typeof materials>()
    for (const m of materials) bySupplier.set(m.supplier_id, [...(bySupplier.get(m.supplier_id) ?? []), m])
    const dbCatalogues = suppliers
      .filter(s => bySupplier.has(s.id))
      .map(s => supplierCatalogueFromDb(s, bySupplier.get(s.id)!, colorsByMaterial))
    return [...ALL_CATALOGUES, ...dbCatalogues]
  }, [suppliers, materials, colorsByMaterial])
}
