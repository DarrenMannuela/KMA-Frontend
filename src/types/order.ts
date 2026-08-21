// ─── Matches dto/Orders.go ────────────────────────────────────────────────────
export interface Order {
  id: string          // e.g. "001/KMA/25"
  client_id: number | null   // FK → Client.id. Nullable so existing/one-off
                              // orders with only a free-text company still work.
  company: string | null     // Denormalized company name, snapshotted from the
                              // linked Client (or typed manually) at order time —
                              // kept for display/printing even if the Client
                              // record is later renamed or removed.
  po_number: string | null
  date: string        // ISO date string
}

// ─── Matches dto/Items.go ─────────────────────────────────────────────────────
// Note: order_id is a string in the OpenAPI spec (e.g. "001/KMA/25")
export interface Item {
  id: number
  order_id: string    // matches Orders.id — string ID like "001/KMA/25"
  item_name: string
  size: string | null
  amount: number
  price: number
  sub_total: number
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateOrderRequest = Order
export type UpdateOrderRequest = Partial<CreateOrderRequest>

export type CreateItemRequest = Omit<Item, 'id'>
export type UpdateItemRequest = Partial<CreateItemRequest>
