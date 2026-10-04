// Phase 0 bill-reading test.
//   npm run eval:check                      → sanity-check the hand-made answers (no AI)
//   GEMINI_API_KEY=... npm run eval:bills   → read every bill in golden/images with Gemini and score it
// Optional: GEMINI_MODEL=gemini-3.5-flash (default), RUNS=3 to repeat each bill.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkBill, normalizeBill, type ExtractedBill } from '../src/lib/bill'
import { BILL_PROMPT } from '../src/lib/extract/prompt'
import { compareBills } from '../src/lib/extract/compare'

const dir = join(import.meta.dirname, '..', 'golden')
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Record<string, ExtractedBill>
const checkOnly = process.argv.includes('--check')

let failed = 0
if (checkOnly) {
  for (const [file, bill] of Object.entries(expected)) {
    const bad = checkBill(normalizeBill(bill)).filter((c) => c.level !== 'ok')
    console.log(`${bad.length ? '✗' : '✓'} ${file}${bad.map((c) => `\n    ${c.level}: ${c.message}`).join('')}`)
    if (bad.length) failed++
  }
  process.exit(failed ? 1 : 0)
}

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Set GEMINI_API_KEY (free key from https://aistudio.google.com/apikey) or run with --check')
  process.exit(2)
}
const { GoogleGenAI } = await import('@google/genai')
const ai = new GoogleGenAI({ apiKey })
const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'
const runs = Number(process.env.RUNS ?? 1)

let fields = 0, correct = 0, caught = 0, missed = 0
for (const [file, exp] of Object.entries(expected)) {
  const data = readFileSync(join(dir, 'images', file)).toString('base64')
  const mimeType = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
  for (let run = 1; run <= runs; run++) {
    const t0 = Date.now()
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: BILL_PROMPT }, { inlineData: { mimeType, data } }] }],
      config: { responseMimeType: 'application/json', temperature: 0 },
    })
    const got = normalizeBill(JSON.parse(res.text ?? '{}'))
    const results = compareBills(normalizeBill(exp), got)
    const wrong = results.filter((r) => !r.ok)
    const checks = checkBill(got).filter((c) => c.level === 'error')
    fields += results.length
    correct += results.length - wrong.length
    if (wrong.length && checks.length) caught++
    if (wrong.length && !checks.length) missed++
    console.log(`\n${wrong.length ? '✗' : '✓'} ${file} (run ${run}, ${((Date.now() - t0) / 1000).toFixed(1)}s) — ${results.length - wrong.length}/${results.length} fields`)
    for (const w of wrong) console.log(`    ${w.field}: expected ${JSON.stringify(w.expected)} got ${JSON.stringify(w.got)}`)
    for (const c of checks) console.log(`    review screen would flag: ${c.message}`)
  }
}
console.log(`\n${model}: ${correct}/${fields} fields correct (${((100 * correct) / fields).toFixed(1)}%).`)
console.log(`Bills with mistakes the review checks caught: ${caught}; mistakes that would slip through: ${missed}.`)
