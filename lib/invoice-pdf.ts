// ─── Invoice PDF generation (placeholder) ─────────────────────────────────────
// Will use a PDF library (e.g. @react-pdf/renderer or pdfkit) to generate
// branded invoice PDFs on demand. Placeholder returns null so callers can
// gracefully show a "coming soon" state.

import type { Billing, BillingLineItem } from '@/lib/supabase'

export type InvoicePDFOptions = {
  invoice:   Billing
  lineItems: BillingLineItem[]
  vaName:    string
  vaEmail?:  string
}

/**
 * Generates an invoice PDF and returns it as a Blob.
 * Returns null while the feature is not yet implemented.
 */
export async function generateInvoicePDF(
  _options: InvoicePDFOptions,
): Promise<Blob | null> {
  // TODO: build PDF from invoice + line items, return Blob
  return null
}
