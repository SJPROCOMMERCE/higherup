import { supabase } from '@/lib/supabase'
import { getTiers, getTierSync } from '@/lib/pricing'

function getMonthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  return {
    start: new Date(y, m - 1, 1).toISOString(),
    end:   new Date(y, m,     1).toISOString(),
  }
}

// ─── POST /api/billing/recalculate ────────────────────────────────────────────

export async function POST(req: Request) {
  let body: Record<string, string>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { billing_id } = body
  if (!billing_id) return Response.json({ error: 'billing_id required' }, { status: 400 })

  const pricingTiers = await getTiers()

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
    .select('client_id, product_row_count, unique_product_count, uploaded_at, clients(store_name, niche)')
    .eq('va_id', bill.va_id)
    .eq('status', 'done')
    .gte('uploaded_at', start)
    .lt('uploaded_at', end)

  if (!uploads || uploads.length === 0) {
    // Nothing uploaded → zero out
    await supabase.from('billing').update({
      total_variants: 0, total_clients: 0, total_amount: 0,
      notes: `Recalculated ${new Date().toISOString()}: no uploads found.`,
    }).eq('id', billing_id)
    return Response.json({ ok: true, total_amount: 0, clients: 0 })
  }

  // 3. Group by client
  const clientMap = new Map<string, {
    client_id: string; store_name: string; niche: string | null
    variant_count: number; unique_product_count: number
    upload_count: number; first: string | null; last: string | null
  }>()

  for (const row of uploads) {
    const r = row as unknown as {
      client_id: string; product_row_count: number | null
      unique_product_count: number | null; uploaded_at: string
      clients: { store_name: string; niche: string | null } | null
    }
    const ex = clientMap.get(r.client_id)
    if (ex) {
      ex.variant_count        += r.product_row_count ?? 0
      ex.unique_product_count += r.unique_product_count ?? 0
      ex.upload_count++
      if (!ex.first || r.uploaded_at < ex.first) ex.first = r.uploaded_at
      if (!ex.last  || r.uploaded_at > ex.last)  ex.last  = r.uploaded_at
    } else {
      clientMap.set(r.client_id, {
        client_id:            r.client_id,
        store_name:           r.clients?.store_name ?? 'Unknown',
        niche:                r.clients?.niche ?? null,
        variant_count:        r.product_row_count ?? 0,
        unique_product_count: r.unique_product_count ?? 0,
        upload_count:         1,
        first:                r.uploaded_at,
        last:                 r.uploaded_at,
      })
    }
  }

  const clients       = [...clientMap.values()].filter(c => c.variant_count > 0)
  const totalVariants = clients.reduce((s, c) => s + c.variant_count, 0)
  const totalAmount   = clients.reduce((s, c) => s + getTierSync(pricingTiers, c.variant_count).amount, 0)

  // 4. Create new line items
  await supabase.from('billing_line_items').insert(
    clients.map(c => ({
      billing_id:           billing_id,
      client_id:            c.client_id,
      store_name:           c.store_name,
      niche:                c.niche,
      variant_count:        c.variant_count,
      unique_product_count: c.unique_product_count,
      tier:                 getTierSync(pricingTiers, c.variant_count).tier_name,
      amount:               getTierSync(pricingTiers, c.variant_count).amount,
      upload_count:         c.upload_count,
      first_upload_at:      c.first,
      last_upload_at:       c.last,
    }))
  )

  // 5. Update billing totals
  await supabase.from('billing').update({
    total_variants: totalVariants,
    total_clients:  clients.length,
    total_amount:   totalAmount,
    notes:          `Recalculated ${new Date().toISOString()}`,
  }).eq('id', billing_id)

  console.log(`[recalculate] Invoice ${bill.invoice_number}: $${totalAmount} (${clients.length} clients)`)
  return Response.json({ ok: true, total_amount: totalAmount, clients: clients.length, total_variants: totalVariants })
}
