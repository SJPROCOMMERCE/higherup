import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { calculateBillableAmount, formatBillingMonth, getPreviousBillingMonth } from '@/lib/usage-tracker'

// ─── Constants ────────────────────────────────────────────────────────────────

const INVOICE_PREFIX = 'HU'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  return {
    start: new Date(y, m - 1, 1).toISOString(),
    end:   new Date(y, m,     1).toISOString(),
  }
}

function getDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)    // 14-day payment window
  return d.toISOString()
}

async function nextInvoiceNumber(month: string, offset: number): Promise<string> {
  const prefix = `${INVOICE_PREFIX}-${month}-`
  const { data } = await supabase
    .from('billing')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)

  const maxSeq = (data ?? []).reduce((max, r) => {
    const seq = parseInt((r.invoice_number as string).replace(prefix, '')) || 0
    return Math.max(max, seq)
  }, 0)

  return `${prefix}${String(maxSeq + offset + 1).padStart(3, '0')}`
}

// ─── POST /api/billing/generate-invoices ──────────────────────────────────────
// Called by Vercel cron on the 1st of each month (5 0 1 * *).
// Generates invoices for the PREVIOUS month using per-product pricing.

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let month: string
  try {
    const body = await req.json().catch(() => ({}))
    month = (body as Record<string, string>).month ?? getPreviousBillingMonth()
  } catch {
    month = getPreviousBillingMonth()
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
  }

  const { start, end } = getMonthBounds(month)
  const dueDate        = getDueDate()
  const monthLabel     = formatBillingMonth(month)

  // Get all active VAs
  const { data: vas, error: vasErr } = await supabase
    .from('vas')
    .select('id, name, email, payment_method, payment_details')
    .eq('status', 'active')

  if (vasErr || !vas) {
    return Response.json({ error: 'Failed to load VAs' }, { status: 500 })
  }

  let invoicesGenerated = 0
  let totalRevenue      = 0
  let invoiceOffset     = 0

  for (const va of vas) {
    // ── Skip if invoice already exists ────────────────────────────────────
    const { data: existing } = await supabase
      .from('billing')
      .select('id')
      .eq('va_id', va.id)
      .eq('month', month)
      .maybeSingle()

    if (existing) continue

    // ── Query done uploads this month ─────────────────────────────────────
    const { data: uploads } = await supabase
      .from('uploads')
      .select('id, client_id, product_row_count, uploaded_at, store_name, clients(store_name, niche)')
      .eq('va_id', va.id)
      .eq('status', 'done')
      .gte('uploaded_at', start)
      .lt('uploaded_at', end)

    if (!uploads || uploads.length === 0) continue

    // ── Calculate totals using va_usage (already logged per-upload) ───────
    const { data: usageRows } = await supabase
      .from('va_usage')
      .select('upload_id, product_count, free_count, billable_count, total_amount')
      .eq('va_id', va.id)
      .eq('billing_month', month)

    // If va_usage rows exist for this month, use them.
    // Otherwise fall back to re-calculating from uploads.
    let totalProducts    = 0
    let freeProducts     = 0
    let billableProducts = 0
    let totalAmount      = 0

    const usageByUpload: Record<string, { product_count: number; free_count: number; billable_count: number; total_amount: number }> = {}

    if (usageRows && usageRows.length > 0) {
      for (const row of usageRows) {
        totalProducts    += row.product_count   ?? 0
        freeProducts     += row.free_count      ?? 0
        billableProducts += row.billable_count  ?? 0
        totalAmount      += Number(row.total_amount ?? 0)
        if (row.upload_id) {
          usageByUpload[row.upload_id] = {
            product_count:  row.product_count  ?? 0,
            free_count:     row.free_count     ?? 0,
            billable_count: row.billable_count ?? 0,
            total_amount:   Number(row.total_amount ?? 0),
          }
        }
      }
      totalAmount = Math.round(totalAmount * 100) / 100
    } else {
      // Fallback: re-derive from uploads
      totalProducts = uploads.reduce((s, u) => s + ((u as { product_row_count?: number }).product_row_count ?? 0), 0)
      const calc    = calculateBillableAmount(totalProducts)
      freeProducts     = calc.freeProducts
      billableProducts = calc.billableProducts
      totalAmount      = calc.totalAmount
    }

    // Skip VA if they owe nothing ($0 invoice)
    if (totalAmount <= 0) continue

    const invoiceNumber = await nextInvoiceNumber(month, invoiceOffset++)

    // ── Create billing record ─────────────────────────────────────────────
    const { data: bill, error: billErr } = await supabase
      .from('billing')
      .insert({
        invoice_number:     invoiceNumber,
        va_id:              va.id,
        month,
        va_name:            va.name,
        va_email:           va.email,
        va_payment_method:  va.payment_method,
        va_payment_details: va.payment_details,
        total_variants:     totalProducts,        // kept for compat — = total products
        total_clients:      uploads.length,       // # of uploads
        total_amount:       totalAmount,
        total_products:     totalProducts,
        free_products:      freeProducts,
        billable_products:  billableProducts,
        currency:           'USD',
        status:             'outstanding',
        due_date:           dueDate,
        generated_at:       new Date().toISOString(),
        created_by:         'system',
      })
      .select('id')
      .single()

    if (billErr || !bill) {
      console.error(`[billing] Failed to create invoice for VA ${va.id}:`, billErr?.message)
      continue
    }

    // ── Create line items (one per upload) ────────────────────────────────
    const lineItems = (uploads as any[]).map(u => {
      const usage = usageByUpload[u.id]
      const pCount = (u as { product_row_count?: number }).product_row_count ?? 0
      const clients = Array.isArray(u.clients) ? u.clients[0] : u.clients
      return {
        billing_id:           bill.id,
        client_id:            u.client_id,
        upload_id:            u.id,
        store_name:           clients?.store_name ?? u.store_name ?? 'Unknown',
        niche:                clients?.niche ?? null,
        variant_count:        pCount,
        unique_product_count: pCount,
        product_count:        usage?.product_count  ?? pCount,
        free_count:           usage?.free_count     ?? 0,
        billable_count:       usage?.billable_count ?? 0,
        amount:               usage?.total_amount   ?? 0,
        tier:                 null,               // no longer tier-based
        upload_count:         1,
        first_upload_at:      u.uploaded_at,
        last_upload_at:       u.uploaded_at,
      }
    })

    await supabase.from('billing_line_items').insert(lineItems)

    // ── Notify VA (earnings-first framing) ────────────────────────────────
    const dueByLabel = new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

    await supabase.from('notifications').insert({
      va_id:   va.id,
      type:    'invoice_generated',
      title:   `Invoice for ${monthLabel} — $${totalAmount.toFixed(2)}`,
      message: `Your HigherUp share for ${monthLabel} is ready: ${billableProducts} products × $0.25 = $${totalAmount.toFixed(2)}. Due by ${dueByLabel}. Pay to keep your outputs unlocked.`,
      is_read: false,
    })

    await logActivity({
      action:   'invoice_generated',
      va_id:    va.id,
      billing_id: bill.id,
      source:   'system',
      details:  `Invoice ${invoiceNumber} generated for ${va.name}: $${totalAmount.toFixed(2)} (${billableProducts} billable products) for ${monthLabel}`,
      metadata: {
        invoice_number:   invoiceNumber,
        amount:           totalAmount,
        total_products:   totalProducts,
        free_products:    freeProducts,
        billable_products: billableProducts,
        uploads:          uploads.length,
      },
    })

    // ── Lock outputs until invoice is paid ───────────────────────────────
    await supabase.from('uploads')
      .update({ output_locked: true, output_locked_at: new Date().toISOString() })
      .eq('va_id', va.id)
      .eq('status', 'done')
      .or('output_locked.is.null,output_locked.eq.false')

    invoicesGenerated++
    totalRevenue += totalAmount
    console.log(`[billing] Invoice ${invoiceNumber} created for VA ${va.id}: $${totalAmount.toFixed(2)} (${billableProducts} billable products)`)
  }

  return Response.json({
    ok:                 true,
    month,
    invoices_generated: invoicesGenerated,
    total_revenue:      Math.round(totalRevenue * 100) / 100,
  })
}
