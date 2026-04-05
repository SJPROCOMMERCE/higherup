import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import RecruitClient from './RecruitClient'

export default async function RecruitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const db = genxDb()
  const lgId = session.lgId

  const [lgRes, linksRes, clicksRes, outreachRes] = await Promise.all([
    db.from('lead_generators').select('referral_code').eq('id', lgId).single(),
    db.from('referral_links').select('*').eq('lg_id', lgId).order('created_at', { ascending: true }),
    db.from('referral_clicks').select('id').eq('lg_id', lgId),
    db.from('lg_outreach').select('*').eq('lg_id', lgId).order('updated_at', { ascending: false }),
  ])

  const referralCode = (lgRes.data?.referral_code as string) || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const defaultLink = `${appUrl}/ref/${referralCode}`

  return (
    <RecruitClient
      lgId={lgId}
      referralCode={referralCode}
      defaultLink={defaultLink}
      appUrl={appUrl}
      links={linksRes.data || []}
      totalClicks={(clicksRes.data || []).length}
      contacts={outreachRes.data || []}
    />
  )
}
