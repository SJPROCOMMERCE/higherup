import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import ToolkitClient from './ToolkitClient'

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

export default async function ToolkitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')

  const db = genxDb()
  const lgId = session.lgId
  const weekStart = getWeekStart()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'

  const [lgRes, scriptsRes, myScriptsRes, contactsRes, linksRes, clicksRes, assetsRes, plannerRes] = await Promise.all([
    db.from('lead_generators').select('referral_code').eq('id', lgId).single(),
    db.from('genx_toolkit').select('*').eq('is_active', true).eq('category', 'script').order('sort_order', { ascending: true }),
    db.from('lg_custom_scripts').select('*').eq('lg_id', lgId).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
    db.from('lg_contacts').select('*').eq('lg_id', lgId).eq('is_archived', false).order('updated_at', { ascending: false }),
    db.from('referral_links').select('*').eq('lg_id', lgId).order('created_at', { ascending: true }),
    db.from('referral_clicks').select('id').eq('lg_id', lgId),
    db.from('genx_assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    db.from('lg_weekly_activity').select('*').eq('lg_id', lgId).eq('week_start', weekStart).order('day_of_week', { ascending: true }),
  ])

  const referralCode = (lgRes.data?.referral_code as string) || ''
  const defaultLink = referralCode ? `${appUrl}/ref/${referralCode}` : ''

  return (
    <ToolkitClient
      lgId={lgId}
      referralCode={referralCode}
      defaultLink={defaultLink}
      defaultScripts={scriptsRes.data || []}
      myScripts={myScriptsRes.data || []}
      contacts={contactsRes.data || []}
      links={linksRes.data || []}
      totalClicks={(clicksRes.data || []).length}
      assets={assetsRes.data || []}
      plannerData={plannerRes.data || []}
      weekStart={weekStart}
    />
  )
}
