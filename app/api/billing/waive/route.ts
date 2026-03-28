import { supabase } from '@/lib/supabase'

// ─── POST /api/billing/waive ──────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: Record<string, string>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { billing_id, notes } = body
  if (!billing_id) return Response.json({ error: 'billing_id required' }, { status: 400 })

  const { data: bill, error: fetchErr } = await supabase
    .from('billing').select('id, va_id, month, total_amount, invoice_number').eq('id', billing_id).single()
  if (fetchErr || !bill) return Response.json({ error: 'Invoice not found' }, { status: 404 })

  const { error } = await supabase.from('billing').update({
    status: 'waived',
    notes:  notes || null,
  }).eq('id', billing_id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // ── Unlock outputs if all invoices are now paid/waived ─────────────────────
  const { data: remainingBills } = await supabase
    .from('billing')
    .select('id')
    .eq('va_id', bill.va_id)
    .in('status', ['outstanding', 'overdue'])

  if (!remainingBills || remainingBills.length === 0) {
    await supabase.from('uploads')
      .update({ output_locked: false, output_unlocked_at: new Date().toISOString() })
      .eq('va_id', bill.va_id)
      .eq('output_locked', true)
  }

  // Optional notification to VA
  await supabase.from('notifications').insert({
    va_id:   bill.va_id,
    type:    'payment_received',
    title:   `Invoice waived — ${formatMonth(bill.month as string)}`,
    message: `Your invoice of $${(bill.total_amount as number).toFixed(0)} for ${formatMonth(bill.month as string)} has been waived. No payment is required.`,
    is_read: false,
  })

  console.log(`[waive] Invoice ${bill.invoice_number} waived for VA ${bill.va_id}`)
  return Response.json({ ok: true })
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
