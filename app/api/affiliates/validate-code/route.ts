import { supabase } from '@/lib/supabase'

// ─── GET /api/affiliates/validate-code?code=XXXX&va_id=YYYY ──────────────────
// va_id is optional — used only to detect self-referral

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code  = (searchParams.get('code') ?? '').trim().toUpperCase()
  const va_id = searchParams.get('va_id') ?? ''

  if (!code) {
    return Response.json({ valid: false, error: 'No code provided' })
  }

  // Look up code in referral_codes
  const { data: rc, error } = await supabase
    .from('referral_codes')
    .select('va_id, code')
    .eq('code', code)
    .maybeSingle()

  if (error || !rc) {
    return Response.json({ valid: false, error: 'Code not recognized' })
  }

  // Self-referral check
  if (va_id && rc.va_id === va_id) {
    return Response.json({ valid: false, error: 'self', referrer_name: null })
  }

  // Get referrer first name only (privacy)
  const { data: referrer } = await supabase
    .from('vas')
    .select('name, status')
    .eq('id', rc.va_id)
    .single()

  if (!referrer || referrer.status === 'blocked') {
    return Response.json({ valid: false, error: 'Code not recognized' })
  }

  const firstName = (referrer.name ?? '').split(' ')[0] || 'Someone'

  return Response.json({ valid: true, referrer_name: firstName, referrer_va_id: rc.va_id })
}
