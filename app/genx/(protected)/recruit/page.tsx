import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import RecruitClient from './RecruitClient'

export default async function RecruitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId

  const [lgRes, linksRes, clicksRes, outreachRes] = await Promise.all([
    supabase.from('lead_generators').select('referral_code').eq('id', lgId).single(),
    supabase.from('referral_links').select('*').eq('lg_id', lgId).order('created_at', { ascending: true }),
    supabase.from('referral_clicks').select('id').eq('lg_id', lgId),
    supabase.from('lg_outreach').select('*').eq('lg_id', lgId).order('updated_at', { ascending: false }),
  ])

  const referralCode = (lgRes.data?.referral_code as string) || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const defaultLink = `${appUrl}/join/${referralCode}`

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
