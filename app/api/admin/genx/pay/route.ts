import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { payout_id, payment_reference } = await req.json()
  await supabase.from('lg_payouts').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    reference: payment_reference || null,
  }).eq('id', payout_id)
  return Response.json({ ok: true })
}
