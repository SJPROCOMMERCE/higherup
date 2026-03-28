import { supabase } from '@/lib/supabase'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ─── Generate a unique FIRSTNAME-4HEX code ────────────────────────────────────

function makeCode(firstName: string): string {
  const name = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'VA'
  const hex  = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
  return `${name}-${hex}`
}

// ─── POST /api/affiliates/generate-code ──────────────────────────────────────
// Body: { va_id }
// Returns the VA's referral code (creates one if it doesn't exist yet)

export async function POST(req: Request) {
  let body: Record<string, string>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { va_id } = body
  if (!va_id) return Response.json({ error: 'va_id required' }, { status: 400 })

  // Check if code already exists (use limit(1) — maybeSingle() breaks when there are duplicates)
  const { data: existingArr } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('va_id', va_id)
    .limit(1)

  const existing = existingArr?.[0] ?? null
  if (existing) {
    return Response.json({ ok: true, code: existing.code, link: existing.link, created: false })
  }

  // Load VA to get first name
  const { data: va } = await supabase
    .from('vas')
    .select('name')
    .eq('id', va_id)
    .single()

  if (!va) return Response.json({ error: 'VA not found' }, { status: 404 })

  const firstName = (va.name ?? '').split(' ')[0] || 'VA'

  // Generate a unique code (retry up to 5 times on collision)
  let code = ''
  for (let i = 0; i < 5; i++) {
    const candidate = makeCode(firstName)
    const { data: collision } = await supabase
      .from('referral_codes')
      .select('id')
      .eq('code', candidate)
      .maybeSingle()
    if (!collision) { code = candidate; break }
  }

  if (!code) return Response.json({ error: 'Could not generate unique code' }, { status: 500 })

  const link = `${BASE_URL}/join?ref=${code}`

  const { data: rc, error: insertErr } = await supabase
    .from('referral_codes')
    .insert({ va_id, code, link, total_referrals: 0, active_referrals: 0, total_earned: 0, current_month_earned: 0 })
    .select()
    .single()

  if (insertErr || !rc) {
    return Response.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  console.log(`[generate-code] Created code ${code} for VA ${va_id}`)
  return Response.json({ ok: true, code, link, created: true })
}
