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

  const [toolkitRes, myScriptsRes, weeklyRes, signupsRes] = await Promise.all([
    // Default scripts — select('*') werkt pre- en post-migratie
    db.from('genx_toolkit')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true }),

    // Custom scripts van deze LG
    db.from('lg_custom_scripts')
      .select('*')
      .eq('lg_id', session.lgId)
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),

    // Weekly activity
    db.from('lg_weekly_activity')
      .select('day_of_week, dms_sent, posts_made, followups_sent')
      .eq('lg_id', session.lgId)
      .eq('week_start', weekStart),

    // Sign-ups deze week
    db.from('referral_tracking')
      .select('id')
      .eq('lg_id', session.lgId)
      .gte('referred_at', weekStart)
      .lt('referred_at', weekEnd.toISOString()),
  ])

  // Normaliseer toolkit items
  // Schema mapping:
  //   type     → top-level category ('script' | 'faq') — CHECK constraint
  //   category → subcategory pre-migration ('first_contact', 'follow_up' etc.)
  //   subcategory kolom → subcategory post-migration (na genx-migrate.sql)
  const items = (toolkitRes.data || []).map(item => ({
    id:              item.id as string,
    category:        (item.type as string) || 'script',                                   // top-level: script | faq
    subcategory:     (item.subcategory as string | null) || (item.category as string | null) || null, // subcategory: post- of pre-migration
    channel:         (item.channel as string | null) || 'general',
    title:           item.title as string,
    description:     item.description as string | null,
    content:         item.content as string,
    attachment_url:  item.attachment_url as string | null,
    attachment_name: item.attachment_name as string | null,
    usage_count:     (item.copies as number) || 0,
  }))

  // Weekly planner — lege array als tabel niet bestaat (migratie nog niet gedraaid)
  const weeklyMigrationNeeded = !!myScriptsRes.error?.message?.includes('does not exist')
    || !!weeklyRes.error?.message?.includes('does not exist')

  const weeklyDays = Array.from({ length: 7 }, (_, i) => {
    const found = (weeklyRes.data || []).find((r: Record<string, unknown>) => r.day_of_week === i)
    return {
      day_of_week:    i,
      dms_sent:       (found?.dms_sent as number) || 0,
      posts_made:     (found?.posts_made as number) || 0,
      followups_sent: (found?.followups_sent as number) || 0,
    }
  })

  return (
    <ToolkitClient
      items={items}
      myScripts={myScriptsRes.data || []}
      weeklyDays={weeklyDays}
      weekStart={weekStart}
      signupsThisWeek={(signupsRes.data || []).length}
      lgId={session.lgId}
      migrationNeeded={weeklyMigrationNeeded}
    />
  )
}
