import { createClient } from '@supabase/supabase-js'

// Service role bypasses RLS — required since the VA inserting is not an LG
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: Request) {
  const { va_id, referral_code } = await request.json() as { va_id?: string; referral_code?: string }
  if (!va_id || !referral_code) return Response.json({ error: 'Missing fields' }, { status: 400 })

  const db = admin()
  const code = referral_code.trim().toLowerCase()

  // Find active LG by referral code (stored lowercase)
  const { data: lg } = await db
    .from('lead_generators')
    .select('id, display_name, total_vas')
    .eq('referral_code', code)
    .eq('status', 'active')
    .single()

  if (!lg) return Response.json({ error: 'Invalid referral code' }, { status: 404 })

  // Idempotent: skip if VA already linked
  const { data: existing } = await db
    .from('referral_tracking')
    .select('id')
    .eq('va_user_id', va_id)
    .maybeSingle()

  if (existing) return Response.json({ ok: true, note: 'Already linked' })

  // Get VA name for pulse event
  const { data: va } = await db.from('vas').select('name').eq('id', va_id).single()
  const vaName = (va as { name?: string } | null)?.name || 'New VA'

  // Link VA → LG
  const { error: insertErr } = await db.from('referral_tracking').insert({
    lg_id:      lg.id,
    va_user_id: va_id,
    source:     'direct',
    status:     'active',
  })

  if (insertErr) {
    console.error('[genx] referral_tracking insert failed:', insertErr.message)
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // Increment total_vas on LG
  await db
    .from('lead_generators')
    .update({ total_vas: ((lg.total_vas as number) || 0) + 1 })
    .eq('id', lg.id)

  // Pulse event
  await db.from('lg_pulse_events').insert({
    lg_id:   lg.id,
    type:    'signup',
    payload: { va_id, va_name: vaName },
  })

  // Action: activate new VA
  await db.from('lg_actions').insert({
    lg_id:      lg.id,
    type:       'activate_new_va',
    priority:   'high',
    title:      `New VA signed up: ${vaName}`,
    body:       'Help them submit their first upload to activate earnings.',
    va_user_id: va_id,
  })

  console.log(`[genx] referral linked | lg=${lg.id} | va=${va_id} | code=${code}`)
  return Response.json({ ok: true })
}
