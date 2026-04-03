import { supabase } from '@/lib/supabase'
import { getMonthlyUsage, getCurrentBillingMonth } from '@/lib/usage-tracker'

// ─── GET /api/usage ──────────────────────────────────────────────────────────
// Returns current-month usage for the authenticated VA.
// Query params: ?va_id=...&month=YYYY-MM (month is optional, defaults to current)

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const vaId  = url.searchParams.get('va_id')
  const month = url.searchParams.get('month') ?? getCurrentBillingMonth()

  if (!vaId) return Response.json({ error: 'va_id required' }, { status: 400 })

  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
  }

  const summary = await getMonthlyUsage(supabase, vaId, month)

  // Also fetch upload-level breakdown for this month
  const { data: rows } = await supabase
    .from('va_usage')
    .select('id, upload_id, product_count, free_count, billable_count, total_amount, source, created_at')
    .eq('va_id', vaId)
    .eq('billing_month', month)
    .order('created_at', { ascending: false })

  // Enrich with store name from uploads
  const uploadIds = (rows ?? []).map(r => r.upload_id).filter(Boolean)
  let uploadMeta: Record<string, { store_name: string | null }> = {}
  if (uploadIds.length) {
    const { data: uploads } = await supabase
      .from('uploads')
      .select('id, store_name')
      .in('id', uploadIds)
    for (const u of uploads ?? []) {
      uploadMeta[u.id] = { store_name: u.store_name }
    }
  }

  const enriched = (rows ?? []).map(r => ({
    ...r,
    store_name: r.upload_id ? (uploadMeta[r.upload_id]?.store_name ?? null) : null,
  }))

  return Response.json({ ...summary, rows: enriched })
}
