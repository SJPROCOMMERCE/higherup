import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { supabase } from '@/lib/supabase'
import PulseClient from './PulseClient'

export default async function PulsePage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')
  const lgId = session.lgId

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [eventsRes, todayRes] = await Promise.all([
    supabase.from('lg_pulse_events')
      .select('*')
      .eq('lg_id', lgId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('lg_pulse_events')
      .select('event_type, product_count, earning_amount, va_id')
      .eq('lg_id', lgId)
      .gte('created_at', todayStart.toISOString()),
  ])

  const today = todayRes.data || []
  const todayStats = {
    products: today.filter((e: Record<string, unknown>) => e.event_type === 'optimized').reduce((s, e: Record<string, unknown>) => s + ((e.product_count as number) || 0), 0),
    earnings: today.filter((e: Record<string, unknown>) => e.event_type === 'optimized').reduce((s, e: Record<string, unknown>) => s + parseFloat(String(e.earning_amount || 0)), 0),
    signups:  today.filter((e: Record<string, unknown>) => e.event_type === 'signup').length,
    activeVAs:new Set(today.filter((e: Record<string, unknown>) => e.event_type === 'optimized').map((e: Record<string, unknown>) => e.va_id)).size,
  }

  return (
    <PulseClient
      lgId={lgId}
      initialEvents={(eventsRes.data || []) as Record<string, unknown>[]}
      initialToday={todayStats}
    />
  )
}
