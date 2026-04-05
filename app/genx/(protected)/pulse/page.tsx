import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import PulseClient from './PulseClient'

export default async function PulsePage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const db = genxDb()
  const lgId = session.lgId

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [eventsRes, todayRes] = await Promise.all([
    db.from('lg_pulse_events')
      .select('*')
      .eq('lg_id', lgId)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('lg_pulse_events')
      .select('type, payload')
      .eq('lg_id', lgId)
      .gte('created_at', todayStart.toISOString()),
  ])

  const today = todayRes.data || []
  const todayStats = {
    products:  today.filter((e: Record<string, unknown>) => e.type === 'upload').reduce((s, e: Record<string, unknown>) => s + (((e.payload as Record<string,unknown>)?.products as number) || 0), 0),
    earnings:  today.filter((e: Record<string, unknown>) => e.type === 'upload').reduce((s, e: Record<string, unknown>) => s + parseFloat(String(((e.payload as Record<string,unknown>)?.amount) || 0)), 0),
    signups:   today.filter((e: Record<string, unknown>) => e.type === 'signup').length,
    activeVAs: new Set(today.filter((e: Record<string, unknown>) => e.type === 'upload').map((e: Record<string, unknown>) => (e.payload as Record<string,unknown>)?.va_id)).size,
  }

  return (
    <PulseClient
      lgId={lgId}
      initialEvents={(eventsRes.data || []) as Record<string, unknown>[]}
      initialToday={todayStats}
    />
  )
}
