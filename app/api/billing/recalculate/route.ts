import { supabase } from '@/lib/supabase'
import { calculateBillableAmount } from '@/lib/usage-tracker'

function getMonthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  return {
    start: new Date(y, m - 1, 1).toISOString(),
    end:   new Date(y, m,     1).toISOString(),
  }
}

// ─── POST /api/billing/recalculate ────────────────────────────────────────────
// Re-calculates a billing invoice using per-product pricing.

export async function POST(req: Request) {
  let body: Record<string, string>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { billing_id } = body
  if (!billing_id) return Response.json({ error: 'billing_id required' }, { status: 400 })

  // Load invoice
  const { data: bill, error: billErr } = await supabase
    .from('billing').select('*').eq('id', billing_id).single()
  if (billErr || !bill) return Response.json({ error: 'Invoice not found' }, { status: 404 })

  const { start, end } = getMonthBounds(bill.month as string)

  // 1. Delete existing line items
  await supabase.from('billing_line_items').delete().eq('billing_id', billing_id)

  // 2. Re-query uploads
  const { data: uploads } = await supabase
    .from('uploads')
    .select('id, client_id, product_row_count, uploaded_at, store_name, clients(store_name, niche)')
    .eq('va_id', bill.va_id)
    .eq('status', 'done')
    .gte('uploaded_at', start)
    .lt('uploaded_at', end)

  if (!uploads || uploads.length === 0) {
    await supabase.from('billing').update({
      total_variants: 0, total_products: 0, free_products: 0, billable_products: 0,
      total_clients: 0, total_amount: 0,
      notes: `Recalculated ${new Date().toISOString()}: no uploads found.`,
    }).eq('id', billing_id)
    return Response.json({ ok: true, total_amount: 0, uploads: 0 })
  }

  // 3. Calculate totals
  const totalProducts = (uploads as any[]).reduce((s, u) => s + ((u as { product_row_count?: number }).product_row_count ?? 0), 0)
  const { freeProducts, billableProducts, totalAmount } = calculateBillableAmount(totalProducts)

  // 4. Load va_usage rows for per-upload split
  const { data: usageRows } = await supabase
    .from('va_usage')
    .select('upload_id, product_count, free_count, billable_count, total_amount')
    .eq('va_id', bill.va_id)
    .eq('billing_month', bill.month as string)

  const usageByUpload: Record<string, { product_count: number; free_count: number; billable_count: number; total_amount: number }> = {}
  for (const row of usageRows ?? []) {
    if (row.upload_id) {
      usageByUpload[row.upload_id] = {
        product_count:  row.product_count  ?? 0,
        free_count:     row.free_count     ?? 0,
        billable_count: row.billable_count ?? 0,
        total_amount:   Number(row.total_amount ?? 0),
      }
    }
  }

  // 5. Create new line items (per upload)
  const lineItems = (uploads as any[]).map(u => {
    const usage    = usageByUpload[u.id]
    const pCount   = (u as { product_row_count?: number }).product_row_count ?? 0
    const clients  = Array.isArray(u.clients) ? u.clients[0] : u.clients
    return {
      billing_id:           billing_id,
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
      tier:                 null,
      upload_count:         1,
      first_upload_at:      u.uploaded_at,
      last_upload_at:       u.uploaded_at,
    }
  })

  await supabase.from('billing_line_items').insert(lineItems)

  // 6. Update billing totals
  await supabase.from('billing').update({
    total_variants:    totalProducts,
    total_products:    totalProducts,
    free_products:     freeProducts,
    billable_products: billableProducts,
    total_clients:     uploads.length,
    total_amount:      totalAmount,
    notes:             `Recalculated ${new Date().toISOString()}`,
  }).eq('id', billing_id)

  console.log(`[recalculate] Invoice ${bill.invoice_number}: $${totalAmount.toFixed(2)} (${billableProducts} billable products)`)
  return Response.json({ ok: true, total_amount: totalAmount, uploads: uploads.length, billable_products: billableProducts })
}
