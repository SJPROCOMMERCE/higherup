import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import ToolkitClient from './ToolkitClient'

function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - diff)
  return monday.toISOString().split('T')[0]
}

export default async function ToolkitPage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')

  const db = genxDb()
  const weekStart = getWeekStart()
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
  const lgId = session.lgId

  const [
    toolkitRes,
    myScriptsRes,
    contactsRes,
    linksRes,
    assetsRes,
    weeklyRes,
    signupsRes,
  ] = await Promise.all([
    db.from('genx_toolkit')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true }),

    db.from('lg_custom_scripts')
      .select('*')
      .eq('lg_id', lgId)
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),

    db.from('lg_contacts')
      .select('*')
      .eq('lg_id', lgId)
      .eq('is_archived', false)
      .order('is_starred', { ascending: false })
      .order('next_followup_at', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false }),

    db.from('lg_referral_links')
      .select('*')
      .eq('lg_id', lgId)
      .order('created_at', { ascending: true }),

    db.from('genx_assets')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    db.from('lg_weekly_activity')
      .select('day_of_week, dms_sent, posts_made, followups_sent')
      .eq('lg_id', lgId)
      .eq('week_start', weekStart),

    db.from('referral_tracking')
      .select('id')
      .eq('lg_id', lgId)
      .gte('referred_at', weekStart)
      .lt('referred_at', weekEnd.toISOString()),
  ])

  // Normalize toolkit scripts
  const items = (toolkitRes.data || []).map(item => ({
    id:              item.id as string,
    category:        (item.type as string) || 'script',
    subcategory:     (item.subcategory as string | null) || (item.category as string | null) || null,
    channel:         (item.channel as string | null) || 'general',
    title:           item.title as string,
    description:     item.description as string | null,
    content:         item.content as string,
    attachment_url:  item.attachment_url as string | null,
    attachment_name: item.attachment_name as string | null,
    usage_count:     (item.copies as number) || 0,
  }))

  // Weekly planner days
  const weeklyDays = Array.from({ length: 7 }, (_, i) => {
    const found = (weeklyRes.data || []).find((r: Record<string, unknown>) => r.day_of_week === i)
    return {
      day_of_week:    i,
      dms_sent:       (found?.dms_sent as number) || 0,
      posts_made:     (found?.posts_made as number) || 0,
      followups_sent: (found?.followups_sent as number) || 0,
    }
  })

  const now = new Date().toISOString()
  const contacts = (contactsRes.data || []).map(c => ({
    ...c,
    overdue: c.next_followup_at
      && c.next_followup_at < now
      && !['signed_up', 'activated', 'lost'].includes(c.status as string),
  }))

  return (
    <ToolkitClient
      lgId={lgId}
      referralCode={(session.lg.referral_code as string) || ''}
      items={items}
      myScripts={myScriptsRes.data || []}
      contacts={contacts}
      links={linksRes.data || []}
      assets={assetsRes.data || []}
      weeklyDays={weeklyDays}
      weekStart={weekStart}
      signupsThisWeek={(signupsRes.data || []).length}
      contactsMigrationNeeded={!!contactsRes.error?.message?.includes('does not exist')}
      linksMigrationNeeded={!!linksRes.error?.message?.includes('does not exist')}
      assetsMigrationNeeded={!!assetsRes.error?.message?.includes('does not exist')}
    />
  )
}
