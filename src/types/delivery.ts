// ─── Matches dto/Delivery.go ─────────────────────────────────────────────────
export interface Delivery {
  id: string
  type: string
  client_id: number | null   // FK → Client.id. Nullable — same convention as
                              // Order.client_id, for one-off deliveries with
                              // only a free-text company/address.
  client_contact_id: number | null   // FK → ClientContact.id — which POC at
                                      // the client this delivery is for/from.
                                      // Independent of client_id being set is
                                      // not meaningful (a contact belongs to
                                      // a client), but nullable on its own so
                                      // a delivery can link a client without
                                      // pinning a specific contact.
  company: string | null   // NAMA on the printed DO/SJ — the client's company name
  address: string
  po_number: string | null
  phone_number: string | null
  contact_person: string | null
  date: string
  // A DO is tied to the order whose items it splits into boxes; SJ has none.
  order_id: string | null
}

// ─── Matches dto/DeliveryItem.go ────────────────────────────────────────────
export interface DeliveryItem {
  id: number
  delivery_id: string
  item_name: string
  size: string | null
  amount: number
  box_number: number| null
  delivery?: Delivery
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateDeliveryRequest = Delivery
export type UpdateDeliveryRequest = Partial<CreateDeliveryRequest>

export type CreateDeliveryItemRequest = Omit<DeliveryItem, 'id' | 'delivery'>
export type UpdateDeliveryItemRequest = Partial<CreateDeliveryItemRequest>
