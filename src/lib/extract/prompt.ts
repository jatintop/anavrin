// The one bill-reading instruction used by every AI provider (Gemini in production,
// Claude in the demo, and the eval script). Tuned on the 5 sample bills in /golden.

export const BILL_PROMPT = `You are reading a photo of a saree wholesaler's bill from Bengaluru, India
(a GST tax invoice, a "quotation" or an estimate). Extract it exactly as printed.

Reply with ONLY one JSON object, no other text, in this shape:
{
  "vendorName": string|null,          // the SELLER at the top, e.g. "THE ROYAL THREADS"
  "vendorGstin": string|null,
  "docType": "tax_invoice"|"quotation"|"estimate"|"other",
  "billNo": string|null,              // invoice / QTN number exactly as printed, e.g. "OT001058", "PS-2713/2026-27"
  "billDate": string|null,            // as YYYY-MM-DD. Indian format: 07/08/2026 is 7 August 2026
  "buyer": string|null,               // the "Buyer"/"M/s" name if printed
  "lines": [ { "description": string, "hsn": string|null, "qty": number, "rate": number,
               "discountPct": number|null, "amount": number } ],
  "totalQty": number|null,            // the printed total pieces
  "subtotal": number|null,            // taxable value before GST
  "cgst": number|null, "sgst": number|null, "igst": number|null,   // tax AMOUNTS in rupees, not rates
  "roundOff": number|null,
  "grandTotal": number|null,
  "handwrittenNotes": [ { "text": string, "amount": number|null } ],
  "paidStamp": boolean,
  "warnings": [string]
}

Rules:
- One entry in "lines" per printed item row, in order. Do not merge or split rows.
- Read each row straight across. Photos are often tilted or the paper is curved, so the
  description column can look shifted by a row against the number columns. Match rows by
  serial number and by position, and confirm every row with qty × rate = amount.
- Quantities are whole pieces. Ignore pen tick marks or slashes drawn over numbers
  ("3/Pcs" with a tick is 3).
- Numbers: plain numbers without commas or currency symbols (1,935.00 → 1935).
- Handwritten pen notes near the total (e.g. "-5000" then "16105") go in handwrittenNotes,
  with "amount" as a signed number (-5000). Do not change the printed totals because of them.
- paidStamp is true only if a rubber stamp saying PAID is visible.
- If something is unreadable use null and add a short warning. Never invent a value.
- If qty × rate ≠ amount for a row, or the rows do not add up to the subtotal, keep what is
  printed and add a warning naming the row.`
