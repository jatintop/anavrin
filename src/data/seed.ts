import type { SareeType, Settings, Vendor } from './types'

// Editable in Settings. Codes are letters only so they never clash with the digits after them.
export const DEFAULT_TYPES: SareeType[] = [
  { code: 'KAN', name: 'Kanjeevaram' },
  { code: 'BAN', name: 'Banarasi' },
  { code: 'MYS', name: 'Mysore silk' },
  { code: 'CHN', name: 'Chanderi' },
  { code: 'PCH', name: 'Pochampally / Ikat' },
  { code: 'CTN', name: 'Cotton / Mul' },
  { code: 'LIN', name: 'Linen' },
  { code: 'ORG', name: 'Organza' },
  { code: 'GEO', name: 'Georgette / Chiffon' },
  { code: 'VIS', name: 'Viscose' },
  { code: 'ART', name: 'Art silk / Semi-silk' },
  { code: 'DES', name: 'Designer / Fancy' },
  { code: 'OTH', name: 'Other' },
]

export const DEFAULT_VENDORS: Vendor[] = [
  { id: 'royal-threads', name: 'The Royal Threads', defaultType: 'VIS' },
  { id: 'popular-silk', name: 'Popular Silk', defaultType: 'OTH' },
  { id: 'mahapragya', name: 'Mahapragya Silk Palace', defaultType: 'OTH' },
]

export const DEFAULT_SETTINGS: Settings = { gstRegistered: false, markupPct: 60, roundTo: 50 }
