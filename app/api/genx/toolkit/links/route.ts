import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import { NextRequest } from 'next/server'

const CHANNEL_ABBREVS: Record<string, string> = {
  facebook:  'fb',
  instagram: 'ig',
  whatsapp:  'wa',
  linkedin:  'li',
  telegram:  'tg',
  tiktok:    'tt',
  email:     'em',
}

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()

  const { data, error } = await db
    .from('lg_referral_links')
    .select('*')
    .eq('lg_id', session.lgId)
    .order('created_at', { ascending: true })

  if (error) {
    if (error.message?.includes('does not exist')) {
      return Response.json({ links: [], migration_needed: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ links: data || [] })
}

export async function POST(req: NextRequest) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { channel, label } = body

  if (!channel) {
    return Response.json({ error: 'channel is required' }, { status: 400 })
  }

  const referralCode = (session.lg.referral_code as string) || ''
  const abbrev = CHANNEL_ABBREVS[channel] || channel.substring(0, 2)
  const linkCode = `${referralCode}-${abbrev}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const fullUrl = `${appUrl}/ref/${linkCode}`

  const db = genxDb()

  const { data: link, error } = await db
    .from('lg_referral_links')
    .insert({
      lg_id: session.lgId,
      source: channel,
      label: label?.trim() || null,
      link_code: linkCode,
      full_url: fullUrl,
    })
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ link })
}
