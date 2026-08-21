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
// One year's price for one catalogue item. (client_item_id, year) is
// unique — re-submitting a year corrects it in place rather than adding a
// second row, so this is always the full, deduped year-by-year history.
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
