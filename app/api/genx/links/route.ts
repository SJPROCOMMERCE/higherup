import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { source } = await req.json()
  if (!source) return Response.json({ error: 'Source required' }, { status: 400 })

  const { data: lg } = await supabase.from('lead_generators').select('referral_code').eq('id', session.lgId).single()
  if (!lg) return Response.json({ error: 'LG not found' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const srcShort = (source as string).toLowerCase().slice(0, 2)
  const linkCode = `${lg.referral_code}-${srcShort}`
  const fullUrl = `${appUrl}/ref/${linkCode}`

  const { data: existing } = await supabase.from('referral_links').select('id').eq('link_code', linkCode).single()
  if (existing) return Response.json({ error: 'Link for this source already exists' }, { status: 409 })

  const { data, error } = await supabase.from('referral_links').insert({
    lg_id: session.lgId, source, link_code: linkCode, full_url: fullUrl,
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ link: data })
}
