// Local stand-in for the deployed Apps Script web app, for end-to-end tests:
//   npx tsx tests/mock-webapp.ts   → app on :8787 (dist/), "Google" on :8788/exec
// Runs the real apps-script/Code.gs on fake Google services, and answers like Apps Script does
// (POST /exec → 302 redirect → GET /echo with the JSON and CORS header).
import { readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import vm from 'node:vm'
import { makeGas } from './gas-fake'

const gas = makeGas()
const ctx = vm.createContext({ ...gas.globals, Date, JSON, Math })
vm.runInContext(readFileSync('apps-script/Code.gs', 'utf8'), ctx)
gas.props.set('GEMINI_API_KEY', 'fake')
const KEY = ctx.setup() as string
const golden = JSON.parse(readFileSync('golden/expected.json', 'utf8'))
gas.onFetch(() => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(golden['royal-threads-OT001058.jpg']) }] } }] }) }))

const echoes = new Map<string, string>()
let n = 0
createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (req.method === 'OPTIONS') { res.writeHead(405).end(); return } // Apps Script has no preflight support either
  if (url.pathname === '/exec' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const out = ctx.doPost({ postData: { contents: body } })
      const id = String(++n)
      echoes.set(id, out.getContent())
      res.writeHead(302, { Location: `/echo?id=${id}`, 'Access-Control-Allow-Origin': '*' }).end()
    })
    return
  }
  if (url.pathname === '/echo') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end(echoes.get(url.searchParams.get('id') ?? '') ?? '{}')
    return
  }
  if (url.pathname === '/debug') {
    const tabs = Object.fromEntries([...gas.sheets].map(([k, s]) => [k, s.table()]))
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ key: KEY, tabs, files: gas.files.size }))
    return
  }
  res.writeHead(404).end()
}).listen(8788, '127.0.0.1')

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
createServer((req, res) => {
  const p = new URL(req.url ?? '/', 'http://x').pathname
  const f = join('dist', p === '/' ? 'index.html' : p)
  if (!existsSync(f)) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f))
}).listen(8787, '127.0.0.1')

console.log(`ready key=${KEY}`)
