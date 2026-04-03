'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 8 },
  mono:  { fontFamily: "'JetBrains Mono', monospace" },
  card:  { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

type Event = {
  id: string; event_type: string; va_display_name: string | null
  va_id: string | null; product_count: number | null
  earning_amount: number | null; created_at: string
}

type TodayStats = { products: number; earnings: number; signups: number; activeVAs: number }

function timeLabel(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function EventRow({ event }: { event: Event }) {
  const vaName = event.va_display_name || 'Unknown VA'

  if (event.event_type === 'optimized') {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1F1F1F' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ ...S.mono, fontSize: 12, color: '#555555', minWidth: 36 }}>{timeLabel(event.created_at)}</span>
          <span style={{ fontSize: 13, color: '#888888' }}>
            <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{vaName}</span>
            {' '}optimized{' '}
            <span style={{ ...S.mono, color: '#FFFFFF' }}>{event.product_count}</span>
            {' '}products
          </span>
        </div>
        {event.earning_amount && event.earning_amount > 0 && (
          <span style={{ ...S.mono, fontSize: 13, color: '#22C55E', flexShrink: 0 }}>
            +${parseFloat(String(event.earning_amount)).toFixed(2)}
          </span>
        )}
      </div>
    )
  }

  if (event.event_type === 'signup') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid #1F1F1F' }}>
        <span style={{ ...S.mono, fontSize: 12, color: '#555555', minWidth: 36 }}>{timeLabel(event.created_at)}</span>
        <span style={{ background: '#FFFFFF', color: '#0A0A0A', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 5px', flexShrink: 0 }}>NEW</span>
        <span style={{ fontSize: 13, color: '#888888' }}>
          <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{vaName}</span>
          {' '}signed up via your link
        </span>
      </div>
    )
  }

  if (event.event_type === 'first_upload') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid #1F1F1F' }}>
        <span style={{ ...S.mono, fontSize: 12, color: '#555555', minWidth: 36 }}>{timeLabel(event.created_at)}</span>
        <span style={{ fontSize: 13, color: '#888888' }}>
          <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{vaName}</span>
          {' '}completed first upload
          {event.product_count ? <span style={{ ...S.mono }}> ({event.product_count} products)</span> : ''}
        </span>
      </div>
    )
  }

  return null
}

export default function PulseClient({ lgId, initialEvents, initialToday }: {
  lgId: string
  initialEvents: Record<string, unknown>[]
  initialToday: TodayStats
}) {
  const [events, setEvents] = useState<Event[]>(initialEvents as Event[])
  const [today,  setToday]  = useState<TodayStats & { activeVAIds?: string[] }>({ ...initialToday, activeVAIds: [] })

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase
      .channel(`genx-pulse:${lgId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'lg_pulse_events',
        filter: `lg_id=eq.${lgId}`,
      }, (payload) => {
        const e = payload.new as Event
        setEvents(prev => [e, ...prev].slice(0, 50))

        if (e.event_type === 'optimized') {
          setToday(prev => {
            const ids = new Set([...(prev.activeVAIds || []), e.va_id || ''])
            return {
              ...prev,
              products:     prev.products + (e.product_count || 0),
              earnings:     Math.round((prev.earnings + parseFloat(String(e.earning_amount || 0))) * 100) / 100,
              activeVAs:    ids.size,
              activeVAIds:  [...ids],
            }
          })
        }
        if (e.event_type === 'signup') {
          setToday(prev => ({ ...prev, signups: prev.signups + 1 }))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [lgId])

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>Pulse</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'pulseDot 1.5s ease infinite' }} />
          <span style={{ fontSize: 11, color: '#555555', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Live</span>
        </div>
      </div>

      {/* Feed */}
      <div style={{ ...S.card, marginBottom: 32 }}>
        {events.length === 0 ? (
          <div style={{ fontSize: 13, color: '#555555', textAlign: 'center', padding: '24px 0' }}>
            No events yet. Events appear here as your VAs work.
          </div>
        ) : (
          events.map(e => <EventRow key={e.id} event={e} />)
        )}
      </div>

      {/* Today summary */}
      <div style={S.card}>
        <span style={S.label}>Today</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <span style={{ ...S.label, marginBottom: 4 }}>Products Optimized</span>
            <span style={{ ...S.mono, fontSize: 24, fontWeight: 700, color: '#FFFFFF' }}>{today.products}</span>
          </div>
          <div>
            <span style={{ ...S.label, marginBottom: 4 }}>Your Earnings</span>
            <span style={{ ...S.mono, fontSize: 24, fontWeight: 700, color: '#22C55E' }}>
              ${today.earnings.toFixed(2)}
            </span>
          </div>
          <div>
            <span style={{ ...S.label, marginBottom: 4 }}>New Sign-ups</span>
            <span style={{ ...S.mono, fontSize: 24, fontWeight: 700, color: '#FFFFFF' }}>{today.signups}</span>
          </div>
          <div>
            <span style={{ ...S.label, marginBottom: 4 }}>Active VAs Today</span>
            <span style={{ ...S.mono, fontSize: 24, fontWeight: 700, color: '#FFFFFF' }}>{today.activeVAs}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
