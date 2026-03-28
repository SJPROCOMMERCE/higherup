import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { getTiers, getTierSync } from '@/lib/pricing'
import { getVaMonthEarnings, earningsInvoiceText } from '@/lib/earnings'

// ─── Month helpers ────────────────────────────────────────────────────────────

function getPreviousMonth(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()  // 0-indexed
  if (m === 0) return `${y - 1}-12`
  return `${y}-${String(m).padStart(2, '0')}`
}

function getMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start  = new Date(y, m - 1, 1)
  const end    = new Date(y, m, 1)      // first day of next month
  return { start: start.toISOString(), end: end.toISOString() }
}

function getDueDate(): string {
  const d = new Date()
  d.setHours(d.getHours() + 48)
  return d.toISOString()
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Invoice number ───────────────────────────────────────────────────────────

async function nextInvoiceNumber(month: string, offset: number): Promise<string> {
  const { data } = await supabase
    .from('billing')
    .select('invoice_number')
    .eq('month', month)
    .not('invoice_number', 'is', null)
  const used = (data ?? []).filter(r => r.invoice_number?.startsWith('INV-'))
  const maxSeq = used.reduce((max, r) => {
    const parts = (r.invoice_number as string).split('-')
    return Math.max(max, parseInt(parts[parts.length - 1]) || 0)
  }, 0)
  const seq = maxSeq + offset + 1
  return `INV-${month}-${String(seq).padStart(3, '0')}`
}

// ─── POST /api/billing/generate-invoices ──────────────────────────────────────

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let month: string
  try {
    const body = await req.json().catch(() => ({}))
    month = (body as Record<string, string>).month ?? getPreviousMonth()
  } catch {
    month = getPreviousMonth()
  }

  // Validate format
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
  }

  const pricingTiers   = await getTiers()
  const { start, end } = getMonthBounds(month)
  const dueDate        = getDueDate()
  const monthLabel     = formatMonthLabel(month)

  // Get all active VAs
  const { data: vas, error: vasErr } = await supabase
    .from('vas')
    .select('id, name, email, payment_method, payment_details')
    .eq('status', 'active')

  if (vasErr || !vas) {
    return Response.json({ error: 'Failed to load VAs' }, { status: 500 })
  }

  let invoicesGenerated = 0
  let totalAmount       = 0
  let invoiceOffset     = 0

  for (const va of vas) {
    // ── Check for existing invoice ──────────────────────────────────────────
    const { data: existing } = await supabase
      .from('billing')
      .select('id')
      .eq('va_id', va.id)
      .eq('month', month)
      .maybeSingle()

    if (existing) {
      console.log(`[billing] Skipping VA ${va.id} — invoice already exists for ${month}`)
      continue
    }

    // ── Query done uploads this month ───────────────────────────────────────
    const { data: uploads } = await supabase
      .from('uploads')
      .select('client_id, product_row_count, unique_product_count, clients(store_name, niche)')
      .eq('va_id', va.id)
      .eq('status', 'done')
      .gte('uploaded_at', start)
      .lt('uploaded_at', end)

    if (!uploads || uploads.length === 0) continue

    // ── Group by client_id ──────────────────────────────────────────────────
    type ClientAgg = {
      client_id:            string
      store_name:           string
      niche:                string | null
      variant_count:        number
      unique_product_count: number
      upload_count:         number
      first_upload_at:      string | null
      last_upload_at:       string | null
    }

    const clientMap = new Map<string, ClientAgg>()

    for (const row of uploads) {
      const r = row as unknown as {
        client_id: string
        product_row_count: number | null
        unique_product_count: number | null
        clients: { store_name: string; niche: string | null } | null
      }
      const existing = clientMap.get(r.client_id)
      if (existing) {
        existing.variant_count        += r.product_row_count ?? 0
        existing.unique_product_count += r.unique_product_count ?? 0
        existing.upload_count         += 1
      } else {
        clientMap.set(r.client_id, {
          client_id:            r.client_id,
          store_name:           r.clients?.store_name ?? 'Unknown',
          niche:                r.clients?.niche ?? null,
          variant_count:        r.product_row_count ?? 0,
          unique_product_count: r.unique_product_count ?? 0,
          upload_count:         1,
          first_upload_at:      null,
          last_upload_at:       null,
        })
      }
    }

    // Fetch upload timestamps per client
    for (const [clientId, agg] of clientMap) {
      const { data: ts } = await supabase
        .from('uploads')
        .select('uploaded_at')
        .eq('va_id', va.id)
        .eq('client_id', clientId)
        .eq('status', 'done')
        .gte('uploaded_at', start)
        .lt('uploaded_at', end)
        .order('uploaded_at', { ascending: true })

      if (ts && ts.length > 0) {
        agg.first_upload_at = ts[0].uploaded_at
        agg.last_upload_at  = ts[ts.length - 1].uploaded_at
      }
    }

    const clients = [...clientMap.values()].filter(c => c.variant_count > 0)
    if (clients.length === 0) continue

    const totalVariants = clients.reduce((s, c) => s + c.variant_count, 0)
    const invoiceAmount = clients.reduce((s, c) => s + getTierSync(pricingTiers, c.variant_count).amount, 0)
    const invoiceNumber = await nextInvoiceNumber(month, invoiceOffset++)

    // ── Create billing record ───────────────────────────────────────────────
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
        total_variants:     totalVariants,
        total_clients:      clients.length,
        total_amount:       invoiceAmount,
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

    // ── Create line items ───────────────────────────────────────────────────
    const lineItems = clients.map(c => ({
      billing_id:           bill.id,
      client_id:            c.client_id,
      store_name:           c.store_name,
      niche:                c.niche,
      variant_count:        c.variant_count,
      unique_product_count: c.unique_product_count,
      tier:                 getTierSync(pricingTiers, c.variant_count).tier_name,
      amount:               getTierSync(pricingTiers, c.variant_count).amount,
      upload_count:         c.upload_count,
      first_upload_at:      c.first_upload_at,
      last_upload_at:       c.last_upload_at,
    }))

    await supabase.from('billing_line_items').insert(lineItems)

    // ── Notify VA ───────────────────────────────────────────────────────────
    let notifTitle: string
    let notifMsg:   string

    const earnings   = await getVaMonthEarnings(va.id, month)
    const dueByLabel = new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    ({ title: notifTitle, message: notifMsg } = earningsInvoiceText({
      earnings,
      monthLabel,
      invoiceAmount,
      dueByLabel,
      clientCount:   clients.length,
      totalVariants,
    }))

    await supabase.from('notifications').insert({
      va_id:   va.id,
      type:    'invoice_generated',
      title:   notifTitle,
      message: notifMsg,
      is_read: false,
    })

    await logActivity({ action: 'invoice_generated', va_id: va.id, billing_id: bill.id, source: 'system', details: `Invoice ${invoiceNumber} generated for ${va.name}: $${invoiceAmount} for ${monthLabel}`, metadata: { invoice_number: invoiceNumber, amount: invoiceAmount, total_variants: totalVariants, clients: clients.length } })

    // ── Lock all done uploads for this VA (unpaid invoice now active) ───────
    await supabase.from('uploads')
      .update({ output_locked: true, output_locked_at: new Date().toISOString() })
      .eq('va_id', va.id)
      .eq('status', 'done')
      .or('output_locked.is.null,output_locked.eq.false')

    invoicesGenerated++
    totalAmount += invoiceAmount
    console.log(`[billing] Invoice ${invoiceNumber} created for VA ${va.id}: $${invoiceAmount}`)
  }

  return Response.json({
    ok:                 true,
    month,
    invoices_generated: invoicesGenerated,
    total_amount:       totalAmount,
  })
}
