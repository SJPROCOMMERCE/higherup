import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const { va_id, referral_code } = await request.json() as { va_id?: string; referral_code?: string }
  if (!va_id || !referral_code) return Response.json({ error: 'Missing fields' }, { status: 400 })

  // Find the LG
  const { data: lg } = await supabase
    .from('lead_generators')
    .select('id')
    .eq('referral_code', referral_code.trim().toUpperCase())
    .eq('status', 'active')
    .single()

  if (!lg) return Response.json({ error: 'Invalid referral code' }, { status: 404 })

  // Check VA isn't already linked
  const { data: existing } = await supabase
    .from('referral_tracking')
    .select('id')
    .eq('va_id', va_id)
    .maybeSingle()

  if (existing) return Response.json({ ok: true, note: 'Already linked' })

  // Get VA name
  const { data: va } = await supabase.from('vas').select('name').eq('id', va_id).single()
  const vaName = (va as { name?: string } | null)?.name || 'New VA'

  // Create referral link
  await supabase.from('referral_tracking').insert({
    lg_id:              lg.id,
    va_id,
    referral_code_used: referral_code.trim().toUpperCase(),
    status:             'signed_up',
  })

  // Increment LG total_referred
  await supabase
    .from('lead_generators')
    .update({ total_referred: supabase.rpc('increment_lg_earnings', { lg_id_input: lg.id, amount_input: 0 }) as never })

  // Use direct update with increment
  const { data: lgRow } = await supabase
    .from('lead_generators')
    .select('total_referred')
    .eq('id', lg.id)
    .single()

  await supabase
    .from('lead_generators')
    .update({ total_referred: ((lgRow?.total_referred as number) || 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', lg.id)

  // Pulse event
  await supabase.from('lg_pulse_events').insert({
    lg_id:           lg.id,
    event_type:      'signup',
    va_id,
    va_display_name: vaName,
  })

  console.log(`[genx] referral | lg=${lg.id} | new VA=${va_id} | code=${referral_code}`)

  return Response.json({ ok: true })
}
