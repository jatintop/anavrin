// Bill reading. Real app: Gemini (free tier) called by the Google Sheet server.
// Demo inside Claude: the page asks Claude.
import { normalizeBill, type ExtractedBill } from '../bill'
import { BILL_PROMPT } from './prompt'
import type { Repo } from '../../data/repo'

export interface Extractor {
  name: string
  read(images: Blob[], signal?: AbortSignal): Promise<ExtractedBill & { photoRefs?: string[] }>
}

export function sheetExtractor(repo: Repo): Extractor | null {
  if (!repo.readBill) return null
  return { name: 'Gemini', read: (images) => repo.readBill!(images) }
}

interface SampleFn {
  json(input: string, opts?: { images?: Blob[]; signal?: AbortSignal; modelTier?: string; cache?: boolean }): Promise<unknown>
  limits(): Promise<{ images?: { maxCount: number } }>
}

/** Claude, available only when the demo runs inside a Claude artifact viewer. */
export async function claudeExtractor(): Promise<Extractor | null> {
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } }
  if (!w.claude?.use) return null
  const sample = (await w.claude.use('sample').catch(() => null)) as SampleFn | null
  if (!sample) return null
  const lim = await sample.limits().catch(() => null)
  if (!lim?.images) return null
  return {
    name: 'Claude',
    async read(images, signal) {
      const raw = await sample.json(BILL_PROMPT, { images: images.slice(0, lim.images!.maxCount), signal, cache: false })
      return normalizeBill(raw)
    },
  }
}

/** Shrink phone photos before upload: long edge ≤ 2000px, JPEG. Keeps small print readable. */
export async function prepareImage(file: Blob, maxEdge = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85))
  } catch {
    return file
  }
}
