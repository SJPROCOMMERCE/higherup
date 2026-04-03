import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const { payout_id, payment_reference } = await request.json() as { payout_id?: string; payment_reference?: string }
  if (!payout_id) return Response.json({ error: 'Missing payout_id' }, { status: 400 })

  await supabase
    .from('lg_payouts')
    .update({
      status:            'paid',
      paid_at:           new Date().toISOString(),
      payment_reference: payment_reference || null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', payout_id)

  return Response.json({ ok: true })
}
