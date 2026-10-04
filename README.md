# Anavrin

Phone app for Anavrin's saree business: stock from vendor bills, stall sales, friends & family sales, expenses.
Runs at ₹0: a Google Sheet is the database (and the live spreadsheet), Google Apps Script is the server,
Google Drive holds bill photos, Gemini's free tier reads bills, GitHub Pages hosts the app. Setup: [SETUP.md](SETUP.md).

**Live app:** https://jatintop.github.io/anavrin/

## Making changes

1. Change code, run `npm test`.
2. If anything under `server/` or the shared `src/lib/` changed, run `npm run build` so `apps-script/Code.gs` is regenerated (CI fails if it's stale).
3. Commit and push to `main`. GitHub Actions tests, builds and publishes the app in about a minute.
4. If `apps-script/Code.gs` changed: paste it into the Apps Script editor, then **Deploy → Manage deployments → ✏️ → New version → Deploy**. The URL stays the same.

Real bill photos for the accuracy test go in `golden/images/` on your computer; they are git-ignored because they contain phone numbers.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Bill-reading test set (5 real bills), prompt, checks, eval script | Done — run `npm run eval:bills` with a free key |
| 1 | App shell, people, vendors, saree types, settings, demo mode, Google Sheet sync, offline | Done |
| 2 | Inventory: photo → AI read → review with checks → saree IDs; Price & label; stock list | Done |
| 3 | Stall: fast sale entry (saree ID → discount → UPI / Cash / Pending), works offline | Done |
| 4 | Friends & family sales, Dues list, expenses with receipt photo | Done |
| 5 | Summary / reports tab | |

## How sync works

- The phone keeps a full copy of the data (IndexedDB) and opens instantly, also with no signal.
- Every change except saving a new bill is an *op* (including sales and expenses, so the stall works with no signal) (`src/lib/ops.ts`). It's applied on the phone at once, queued, and sent
  to the sheet when online. Each op has an ID and the server logs it, so a retry never applies twice.
- Saving a bill goes straight to the server, which hands out saree numbers under a lock — two phones can't get the same ID.
- Ops only touch the fields they change, so two people editing different things don't overwrite each other.
- Sale and expense numbers are made on the phone (they carry the person's initial). If the same person uses two phones
  offline and both make the same number, the sheet gives the later one the next free number instead of overwriting.

## Numbering

| What | Format | Example |
|---|---|---|
| Saree | `TYPE-YYMM-NNN` (purchase month, running no. per type per month) | `VIS-2609-001` |
| Purchase bill | `P-YYMM-NNN` | `P-2609-001` |
| Stall sale | `S-YYMMDD-<initial><NN>` | `S-261004-P07` |
| Family sale | `F-YYMM-<initial><NN>` | `F-2610-P08` |
| Expense | `E-YYMM-<initial><NN>` | `E-2610-P31` |

## Cost price

The business buys as an unregistered person ("URP"), so the 5% GST is part of cost.
Each saree's cost = line amount ÷ qty × (grand total ÷ subtotal). A handwritten deduction marked "discount" lowers it;
one marked "advance" does not. Toggle in Settings if the business registers for GST.

## Layout

```
src/lib/                   bill checks & cost maths, numbering, purchase builder, ops, bill-reading prompt
src/data/sheetsRepo.ts     phone side: cache, outbox, sync with the Apps Script web app
src/data/demoRepo.ts       demo store (browser only)
src/screens/               Connect, Home, Inventory, NewPurchase (scan + review), Pricing, Stock, Settings,
                           Stall, Family (+ Dues), Expenses; sell.tsx = saree picker, basket, discounts
server/                    Apps Script server (TypeScript) → bundled to apps-script/Code.gs
golden/                    hand-checked answers for sample bills (photos stay local, git-ignored)
.github/workflows/         test + deploy to GitHub Pages on every push
tests/                     server tests on fake Google services; mock web app for browser tests
```
