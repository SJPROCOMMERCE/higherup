import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const [linksRes, clicksRes, lgRes] = await Promise.all([
    db.from('referral_links').select('*').eq('lg_id', session.lgId).order('created_at', { ascending: true }),
    db.from('referral_clicks').select('id').eq('lg_id', session.lgId),
    db.from('lead_generators').select('referral_code').eq('id', session.lgId).single(),
  ])

  const referralCode = (lgRes.data?.referral_code as string) || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const defaultLink = referralCode ? `${appUrl}/ref/${referralCode}` : ''

  return Response.json({
    links: linksRes.data || [],
    totalClicks: (clicksRes.data || []).length,
    referralCode,
    defaultLink,
  })
}

export async function POST(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { source } = await req.json()
  if (!source?.trim()) return Response.json({ error: 'source required' }, { status: 400 })

  const db = genxDb()
  const { data: lg } = await db
    .from('lead_generators')
    .select('referral_code')
    .eq('id', session.lgId)
    .single()

  if (!lg) return Response.json({ error: 'LG not found' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const srcShort = (source as string).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4)
  const linkCode = `${lg.referral_code}-${srcShort}`
  const fullUrl = `${appUrl}/ref/${linkCode}`

  const { data: existing } = await db
    .from('referral_links')
    .select('id')
    .eq('link_code', linkCode)
    .single()

  if (existing) return Response.json({ error: 'Link for this source already exists' }, { status: 409 })

  const { data, error } = await db
    .from('referral_links')
    .insert({ lg_id: session.lgId, source: source.trim(), link_code: linkCode, full_url: fullUrl })
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/links] POST error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ link: data })
}
