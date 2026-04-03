import { supabase } from '@/lib/supabase'

// ─── GET /api/billing/list ────────────────────────────────────────────────────
// Returns invoices for a VA (sorted newest first).
// Query params: ?va_id=...

export async function GET(req: Request) {
  const url  = new URL(req.url)
  const vaId = url.searchParams.get('va_id')
  if (!vaId) return Response.json({ error: 'va_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('billing')
    .select('id, invoice_number, month, total_amount, total_products, free_products, billable_products, status, due_date, paid_at, generated_at')
    .eq('va_id', vaId)
    .order('month', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
