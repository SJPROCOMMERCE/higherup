import { supabase } from '@/lib/supabase'

// ─── POST /api/affiliates/register ───────────────────────────────────────────
// Called during onboarding when a VA enters a valid referral code.
// Body: { referred_va_id, referral_code }

export async function POST(req: Request) {
  let body: Record<string, string>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { referred_va_id, referral_code } = body
  if (!referred_va_id || !referral_code) {
    return Response.json({ error: 'referred_va_id and referral_code required' }, { status: 400 })
  }

  const code = referral_code.trim().toUpperCase()

  // Look up code → referrer
  const { data: rc } = await supabase
    .from('referral_codes')
    .select('va_id')
    .eq('code', code)
    .maybeSingle()

  if (!rc) return Response.json({ error: 'Code not found' }, { status: 404 })

  const referrer_va_id = rc.va_id

  // Anti-fraude: no self-referral
  if (referrer_va_id === referred_va_id) {
    return Response.json({ error: 'Self-referral not allowed' }, { status: 400 })
  }

  // Check referred VA isn't already in a relation (UNIQUE constraint)
  const { data: existing } = await supabase
    .from('affiliates')
    .select('id')
    .eq('referred_va_id', referred_va_id)
    .maybeSingle()

  if (existing) {
    // Already referred — silently succeed (idempotent)
    return Response.json({ ok: true, already_exists: true })
  }

  // Create affiliate record (only columns guaranteed to exist)
  const { error: affErr } = await supabase.from('affiliates').insert({
    referrer_va_id,
    referred_va_id,
    is_active: true,
  })

  if (affErr) {
    console.error('[affiliates/register] Insert error:', affErr.message)
    return Response.json({ error: affErr.message }, { status: 500 })
  }

  // Update referral_codes counters
  void supabase.rpc('increment_referral_count', { code_text: code })
  // Fallback if RPC doesn't exist
  const { data: rcRow } = await supabase
    .from('referral_codes')
    .select('total_referrals')
    .eq('code', code)
    .single()
  if (rcRow) {
    await supabase
      .from('referral_codes')
      .update({ total_referrals: (rcRow.total_referrals ?? 0) + 1 })
      .eq('code', code)
  }

  console.log(`[affiliates/register] ${referrer_va_id} ← ${referred_va_id} via ${code}`)
  return Response.json({ ok: true })
}
