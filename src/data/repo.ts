import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { ExtractedBill } from '../lib/bill'
import type { Connection } from './connection'
import type { AppUser, DataState, Expense, Item, PayMethod, Purchase, PurchaseDraft, Sale, SareeType, Settings, Vendor } from './types'
import { DEFAULT_SETTINGS } from './seed'

export interface AuthInfo {
  uid: string
  email: string | null
  displayName: string | null
}

export interface Repo {
  mode: 'demo' | 'sheet'
  connection?: Connection
  subscribe(fn: (s: DataState) => void): () => void
  /** latest state, same object until something changes */
  snapshot(): DataState
  onAuth(fn: (a: AuthInfo | null) => void): () => void
  /** pick who is using this phone */
  signIn(userId?: string): Promise<void>
  signOut(): Promise<void>
  saveUser(u: AppUser): Promise<void>
  saveVendor(v: Vendor): Promise<void>
  deleteVendor(id: string): Promise<void>
  saveType(t: SareeType): Promise<void>
  deleteType(code: string): Promise<void>
  saveSettings(s: Settings): Promise<void>
  savePurchase(d: PurchaseDraft, by: AppUser): Promise<Purchase>
  setPurchaseDeleted(id: string, deleted: boolean, by: AppUser): Promise<void>
  updateItems(ids: string[], patch: Partial<Pick<Item, 'price' | 'status' | 'type' | 'design'>>, by: AppUser): Promise<void>
  /** a new stall or family sale; its sarees are marked sold. Works offline. */
  saveSale(s: Sale, by: AppUser): Promise<void>
  /** cancel (or bring back) a sale; cancelling puts its sarees back in stock */
  setSaleDeleted(id: string, deleted: boolean, by: AppUser): Promise<void>
  /** a pending sale has been paid */
  settleSale(id: string, payment: Exclude<PayMethod, 'pending'>, on: string, by: AppUser): Promise<void>
  saveExpense(e: Expense, by: AppUser): Promise<void>
  setExpenseDeleted(id: string, deleted: boolean, by: AppUser): Promise<void>
  savePhoto(blob: Blob): Promise<string>
  photoUrl(ref: string): Promise<string>
  resetDemo?(): Promise<void>
  /** sheet mode: read a bill photo with Gemini on the server (also stores the photo) */
  readBill?(images: Blob[]): Promise<ExtractedBill & { photoRefs: string[] }>
  syncNow?(): Promise<void>
  disconnect?(): Promise<void>
}

export const EMPTY: DataState = {
  ready: false, users: [], vendors: [], types: [], settings: DEFAULT_SETTINGS, purchases: [], items: [], sales: [], expenses: [],
}

export const RepoContext = createContext<Repo | null>(null)

export function useRepo(): Repo {
  const r = useContext(RepoContext)
  if (!r) throw new Error('RepoContext missing')
  return r
}

export function useData(): DataState {
  const repo = useRepo()
  const sub = useCallback((cb: () => void) => repo.subscribe(() => cb()), [repo])
  return useSyncExternalStore(sub, () => repo.snapshot())
}

export const MeContext = createContext<AppUser | null>(null)
export function useMe(): AppUser {
  const me = useContext(MeContext)
  if (!me) throw new Error('not signed in')
  return me
}
