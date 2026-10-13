// ─── Matches dto/Client.go ─────────────────────────────────────────────────
export interface Client {
  id: number
  client_name: string
  address: string | null
  notes: string | null
}

// ─── Matches dto/ClientContact.go ──────────────────────────────────────────
// A client's point(s) of contact. is_primary flags the default POC to
// prefill on Order/Delivery forms.
export interface ClientContact {
  id: number
  client_id: number
  name: string
  role: string | null
  phone_number: string | null
  email: string | null
  location_label: string | null
  address: string | null
  is_primary: boolean
}

// ─── Matches dto/ClientItem.go ─────────────────────────────────────────────
// One catalogue entry for a client — independent of Orders/Items. This is
// "the things we make for this client", not "what they ordered".
export interface ClientItem {
  id: number
  client_id: number
  item_name: string
  size: string | null
  notes: string | null
  photo_path: string | null
}

// ─── Matches dto/ClientItemPrice.go ────────────────────────────────────────
// One year's price for one catalogue item; (client_item_id, year) is unique.
export interface ClientItemPrice {
  id: number
  client_item_id: number
  year: number
  price: number
  effective_date: string | null   // ISO date string, e.g. when the new price kicks in
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateClientRequest = Omit<Client, 'id'>
export type UpdateClientRequest = Partial<CreateClientRequest>

export type CreateClientContactRequest = Omit<ClientContact, 'id'>
export type UpdateClientContactRequest = Partial<CreateClientContactRequest>

// photo_path is set via the dedicated upload endpoint, not on create/update
export type CreateClientItemRequest = Omit<ClientItem, 'id' | 'photo_path'>
export type UpdateClientItemRequest = Partial<CreateClientItemRequest>

export type CreateClientItemPriceRequest = Omit<ClientItemPrice, 'id'>
export type UpdateClientItemPriceRequest = Partial<CreateClientItemPriceRequest>

// ─── POST /client-catalogue/batch ──────────────────────────────────────────
// Changes to one client's catalogue saved together; the result is enough to
// undo them.
export interface CataloguePriceIn {
  client_item_id?: number
  year: number
  price: number
  effective_date: string | null
}

export interface CatalogueBatch {
  client_id: number
  /** Found by name and size, or added; their prices are set. */
  upsert_items?: { item_name: string; size: string; notes?: string | null; prices: CataloguePriceIn[] }[]
  set_prices?: CataloguePriceIn[]
  delete_prices?: { client_item_id: number; year: number }[]
  delete_items?: number[]
}

export interface CatalogueBatchResult {
  items_created: ClientItem[] | null
  items_deleted: ClientItem[] | null
  /** Each touched (item, year) as it was; existed false: there was no price. */
  prices_before: { client_item_id: number; year: number; existed: boolean; price: number; effective_date: string | null }[] | null
  prices: ClientItemPrice[] | null
}
