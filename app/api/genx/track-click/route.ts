import { createHash } from 'crypto'
import { genxDb } from '@/lib/genx-db'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { referral_code } = await request.json() as { referral_code?: string }
  if (!referral_code) return Response.json({ error: 'Code required' }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const ua = request.headers.get('user-agent') || ''
  const ipHash = createHash('sha256').update(ip).digest('hex')

  const db = genxDb()
  const { data: lg } = await db
    .from('lead_generators')
    .select('id')
    .eq('referral_code', referral_code)
    .eq('status', 'active')
    .single()

  if (!lg) return Response.json({ error: 'Invalid code' }, { status: 404 })

  // Dedup: max 1 click per IP per 24h per code
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await db
    .from('referral_clicks')
    .select('id')
    .eq('lg_id', lg.id)
    .eq('ip_hash', ipHash)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (!recent) {
    await db.from('referral_clicks').insert({
      lg_id:         lg.id,
      referral_code,
      ip_hash:       ipHash,
      user_agent:    ua,
    })
  }

  return Response.json({ ok: true })
}
