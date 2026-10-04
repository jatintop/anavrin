import type { Adjustment, BillLine, DocType } from '../lib/bill'

export interface AppUser {
  id: string // random, e.g. u-lx3k9a
  name: string
  initial: string // one capital letter, used in offline-safe transaction IDs
}

export interface Vendor {
  id: string
  name: string
  defaultType: string // saree type code pre-filled on this vendor's bills
}

export interface SareeType {
  code: string // 3 capital letters
  name: string
}

export interface Settings {
  gstRegistered: boolean
  markupPct: number // suggested selling price = cost × (1 + markup)
  roundTo: number // suggested prices round up to this many rupees
}

export type ItemStatus = 'unpriced' | 'in_stock' | 'sold' | 'family' | 'returned'

export interface Item {
  id: string // KAN-2610-012
  type: string
  design: string
  purchaseId: string
  vendorId: string
  vendorName: string
  purchaseDate: string
  cost: number
  price: number | null
  status: ItemStatus
  deleted?: boolean
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

export interface PurchaseLine extends BillLine {
  type: string
  unitCost: number
  itemIds: string[]
}

export interface Purchase {
  id: string // P-2610-005
  vendorId: string
  vendorName: string
  billNo: string
  billDate: string
  docType: DocType
  lines: PurchaseLine[]
  totalQty: number
  subtotal: number
  tax: number
  roundOff: number
  grandTotal: number
  adjustment: Adjustment | null
  amountPaid: number | null
  photoRefs: string[]
  readByAi: boolean
  checksOverridden: boolean
  deleted?: boolean
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

export type DraftLine = BillLine & { type: string }

export interface PurchaseDraft {
  vendorId: string
  vendorName: string
  billNo: string
  billDate: string
  docType: DocType
  lines: DraftLine[]
  subtotal: number
  tax: number
  roundOff: number
  grandTotal: number
  adjustment: Adjustment | null
  amountPaid: number | null
  photoRefs: string[]
  readByAi: boolean
  checksOverridden: boolean
}

export interface SyncInfo {
  online: boolean
  pending: number // changes made on this phone that haven't reached the sheet yet
  lastSync: number | null
  syncing: boolean
  error?: string
}

export interface DataState {
  ready: boolean
  error?: string
  sync?: SyncInfo // only when connected to the Google Sheet
  sheetUrl?: string
  users: AppUser[]
  vendors: Vendor[]
  types: SareeType[]
  settings: Settings
  purchases: Purchase[]
  items: Item[]
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  unpriced: 'Needs price',
  in_stock: 'In stock',
  sold: 'Sold',
  family: 'Family',
  returned: 'Returned',
}
