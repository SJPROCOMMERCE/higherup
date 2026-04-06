import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: contacts, error } = await db
    .from('lg_contacts')
    .select('status, channel, created_at, is_archived')
    .eq('lg_id', session.lgId)

  if (error) {
    if (error.message?.includes('does not exist')) {
      return Response.json({ analytics: null, migration_needed: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  const all = contacts || []
  const total = all.length
  const active = all.filter(c => !['lost'].includes(c.status) && !c.is_archived).length
  const activated = all.filter(c => c.status === 'activated').length
  const conversion_rate = total > 0 ? Math.round((activated / total) * 1000) / 10 : 0

  // Contacts by status
  const statusCounts: Record<string, number> = {}
  for (const c of all) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
  }

  // Contacts by channel
  const channelData: Record<string, { total: number; activated: number }> = {}
  for (const c of all) {
    if (!channelData[c.channel]) channelData[c.channel] = { total: 0, activated: 0 }
    channelData[c.channel].total++
    if (c.status === 'activated') channelData[c.channel].activated++
  }
  const contacts_by_channel = Object.entries(channelData).map(([channel, d]) => ({
    channel,
    total: d.total,
    activated: d.activated,
    conversion_rate: d.total > 0 ? Math.round((d.activated / d.total) * 1000) / 10 : 0,
  }))

  // Weekly new contacts
  const weekly_new_contacts = all.filter(c => c.created_at >= sevenDaysAgo).length

  // Followups due
  const now = new Date().toISOString()
  const { data: followupData } = await db
    .from('lg_contacts')
    .select('id')
    .eq('lg_id', session.lgId)
    .lt('next_followup_at', now)
    .not('next_followup_at', 'is', null)
    .not('status', 'in', '("signed_up","activated","lost")')

  const followups_due = (followupData || []).length

  return Response.json({
    analytics: {
      contacts_by_status: statusCounts,
      contacts_by_channel,
      pipeline_stats: {
        total,
        active,
        conversion_rate,
        followups_due,
      },
      weekly_new_contacts,
    }
  })
}
