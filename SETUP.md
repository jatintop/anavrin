# Setting up Anavrin — ₹0, no card anywhere

Everything runs on free Google and GitHub accounts:

| Part | Where it runs | Cost |
|---|---|---|
| Data | A Google Sheet (this is also your live spreadsheet) | Free |
| Server | Google Apps Script, attached to that sheet | Free |
| Bill photos | Google Drive, folder "Anavrin bill photos" | Free (15 GB per Google account) |
| Bill reading | Gemini API free tier (key from Google AI Studio, no billing) | Free |
| The app itself | GitHub Pages | Free |

About 30 minutes, once. You need: the Google account that should own the data (ideally the one your mother uses, or a shared family account), a GitHub account, and a laptop with Node.js 20+ and Git.

## 1. Free Gemini key (reads the bills)

1. Signed in to that Google account, open <https://aistudio.google.com/apikey> → **Create API key**. Don't add billing.
2. Copy the key.

On the free tier Google may use what you send (the bill photos) to improve its models. Vendor bills are low-risk, but this is the trade-off for ₹0. If the free daily limit runs out, the app says so and you type that bill in.

## 2. The Google Sheet and its server

1. Open <https://sheets.new>. Name the sheet **Anavrin**.
2. **Extensions → Apps Script.**
3. In the script editor: **Project Settings** (gear on the left) → tick **Show "appsscript.json" manifest file in editor**.
4. **Editor** (`< >` on the left):
   - Open `Code.gs`, delete what's there, paste the whole of `apps-script/Code.gs` from this folder.
   - Open `appsscript.json`, replace it with `apps-script/appsscript.json`.
   - Save (Ctrl/Cmd + S).
5. **Project Settings → Script properties → Add script property**: name `GEMINI_API_KEY`, value = the key from step 1. Save.
6. Back in the editor, choose **setup** in the function list at the top → **Run**.
   - Google asks for permission. It will say "Google hasn't verified this app" because it's your own script: **Advanced → Go to Anavrin (unsafe) → Allow**.
   - The log at the bottom shows **Family key: …**. Copy it.
   - The sheet now has tabs: Sarees, Purchases, Bill lines, Vendors, Saree types, People, Settings, Counters, Log.
7. **Deploy → New deployment** → gear → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy** → copy the **Web app URL** (ends in `/exec`).

## 3. Put the app online (GitHub Pages)

The code lives at <https://github.com/jatintop/anavrin>. Every push to `main` runs the tests and publishes the app to
**https://jatintop.github.io/anavrin/** automatically (`.github/workflows/deploy.yml`).

One-time switch: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The Web app URL from step 2.7 is saved in `src/config.ts`, so phones only need the family key.
If you ever make a new deployment with a different URL, update that line and push.

## 4. First phone

1. Open <https://jatintop.github.io/anavrin/> in Chrome (Android) or Safari (iPhone).
2. Type the family key → **Connect**.
3. Type your name and pick your initial.
4. Browser menu → **Add to Home screen**.

## 5. Everyone else

On the first phone: **Settings → Invite family → Copy invite link**, send it on WhatsApp. Opening it connects their phone; they pick or add their name.

Anyone with the invite link can see and change the data, so keep it in the family. To cut off old links: in Apps Script → Script properties, delete `FAMILY_KEY`, run **setup** again (it makes a new key), connect one phone with the new key, and send fresh invites.

## Using the sheet directly

- Read it any time; it's always up to date. **File → Download → Microsoft Excel** gives an Excel copy.
- Small fixes typed into the sheet (a price, a status like `Sold`) reach the phones on their next sync.
- Don't rename tabs or move/rename columns. Add your own columns to the right of the existing ones, or your own tabs, freely.
- The **Log** tab records every change: who, when, what.

## Updating the server code later

Paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The Web app URL stays the same, so phones keep working.

## Free limits (generous for a family business)

- Apps Script: about 20,000 outside calls per day (each bill reading is one), 6 minutes per request.
- Google Drive: 15 GB shared with the account's Gmail; a bill photo is about 0.3 MB.
- Google Sheets: 10 million cells — many years of sarees.
- Gemini free tier: the daily limit depends on Google; see <https://aistudio.google.com/rate-limit>. To test bill reading on the 5 sample bills: `GEMINI_API_KEY=your-key npm run eval:bills`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally; choose "Try the demo" or connect to the sheet |
| `npm test` | All automatic tests (IDs, bill checks, cost maths, and the server running on fake Google services) |
| `npm run build` | Builds the app (`dist/`) and the server (`apps-script/Code.gs`) |
| `git push` | Tests, builds and publishes the app (GitHub Actions) |
| `npm run eval:bills` | Bill-reading accuracy on the sample bills (needs the free key) |
| `npx tsx tests/mock-webapp.ts` | Local fake Google server on :8788 + the built app on :8787, for testing without a Google account |
