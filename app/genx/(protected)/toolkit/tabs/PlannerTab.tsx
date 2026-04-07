'use client'
import { useState } from 'react'
import type { PlannerDay } from '../ToolkitClient'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FIELDS: { key: keyof PlannerDay; label: string; short: string }[] = [
  { key: 'dms_sent', label: 'DMs Sent', short: 'DMs' },
  { key: 'posts_made', label: 'Posts Made', short: 'Posts' },
  { key: 'followups_sent', label: 'Follow-Ups', short: 'F/U' },
  { key: 'calls_made', label: 'Calls Made', short: 'Calls' },
]

type DayMap = Record<number, PlannerDay>

export default function PlannerTab({
  plannerData, weekStart, lgId, S,
}: {
  plannerData: PlannerDay[]
  weekStart: string
  lgId: string
  S: Record<string, React.CSSProperties | Record<string, unknown>>
}) {
  void lgId

  // Build day map: day_of_week (1=Mon, 7=Sun) → row
  const initMap: DayMap = {}
  for (const d of plannerData) initMap[d.day_of_week as number] = d
  const [dayMap, setDayMap] = useState<DayMap>(initMap)
  const [updating, setUpdating] = useState<string | null>(null)

  const todayDow = (() => {
    const d = new Date().getDay()
    return d === 0 ? 7 : d
  })()

  async function increment(dow: number, field: keyof PlannerDay, delta: 1 | -1) {
    const key = `${dow}-${String(field)}`
    setUpdating(key)

    // Optimistic update
    setDayMap(prev => {
      const existing = prev[dow] || { day_of_week: dow, dms_sent: 0, posts_made: 0, followups_sent: 0, calls_made: 0 }
      const current = (existing[field] as number) || 0
      const newVal = Math.max(0, current + delta)
      return { ...prev, [dow]: { ...existing, [field]: newVal } }
    })

    try {
      const res = await fetch('/api/genx/toolkit/planner', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: dow, field, delta }),
      })
      const data = await res.json()
      if (data.day) setDayMap(prev => ({ ...prev, [dow]: data.day }))
    } catch (e) {
      console.error('increment error:', e)
      // Revert optimistic update on error
      setDayMap(prev => {
        const existing = prev[dow] || { day_of_week: dow, dms_sent: 0, posts_made: 0, followups_sent: 0, calls_made: 0 }
        const current = (existing[field] as number) || 0
        return { ...prev, [dow]: { ...existing, [field]: Math.max(0, current - delta) } }
      })
    }
    setUpdating(null)
  }

  // Compute week totals
  const weekTotals = FIELDS.map(f => ({
    ...f,
    total: Object.values(dayMap).reduce((s, d) => s + ((d[f.key] as number) || 0), 0),
  }))

  const totalActions = weekTotals.reduce((s, f) => s + f.total, 0)

  // Format week dates
  const weekDates = DAYS.map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d.getDate()
  })

  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  return (
    <div>
      {/* Week header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}>
            Week of {new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <div style={{ ...mono, fontSize: 12, color: '#22C55E', marginTop: 4 }}>
            {totalActions} actions logged this week
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {weekTotals.map(f => (
            <div key={f.key as string} style={{ textAlign: 'center' }}>
              <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>{f.total}</div>
              <div style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.short}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', borderBottom: '1px solid #1F1F1F' }}>
          <div style={{ padding: '10px 12px', fontSize: 10, color: '#555555' }} />
          {DAYS.map((day, i) => {
            const dow = i + 1
            const isToday = dow === todayDow
            return (
              <div key={day} style={{ padding: '10px 4px', textAlign: 'center', borderLeft: '1px solid #1F1F1F' }}>
                <div style={{ fontSize: 10, color: isToday ? '#FFFFFF' : '#555555', fontWeight: isToday ? 700 : 400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{day}</div>
                <div style={{ ...mono, fontSize: 10, color: isToday ? '#888888' : '#333333' }}>{weekDates[i]}</div>
              </div>
            )
          })}
        </div>

        {/* Field rows */}
        {FIELDS.map(field => (
          <div key={field.key as string} style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', borderBottom: '1px solid #0F0F0F' }}>
            <div style={{ padding: '12px', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{field.short}</span>
            </div>
            {DAYS.map((_, i) => {
              const dow = i + 1
              const isToday = dow === todayDow
              const day = dayMap[dow]
              const val = (day?.[field.key] as number) || 0
              const updateKey = `${dow}-${String(field.key)}`
              const isUpdating = updating === updateKey

              return (
                <div key={dow} style={{
                  borderLeft: '1px solid #1F1F1F',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '8px 4px',
                  background: isToday ? '#111111' : 'transparent',
                }}>
                  <button
                    onClick={() => increment(dow, field.key, -1)}
                    disabled={val === 0 || isUpdating}
                    style={{ background: 'none', border: 'none', color: val > 0 ? '#555555' : '#2A2A2A', cursor: val > 0 ? 'pointer' : 'default', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                  >−</button>
                  <span style={{ ...mono, fontSize: 13, color: val > 0 ? '#FFFFFF' : '#333333', minWidth: 18, textAlign: 'center' }}>{val}</span>
                  <button
                    onClick={() => increment(dow, field.key, 1)}
                    disabled={isUpdating}
                    style={{ background: 'none', border: 'none', color: '#555555', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                  >+</button>
                </div>
              )
            })}
          </div>
        ))}

        {/* Day totals row */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)' }}>
          <div style={{ padding: '10px 12px', fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center' }}>Total</div>
          {DAYS.map((_, i) => {
            const dow = i + 1
            const isToday = dow === todayDow
            const day = dayMap[dow]
            const total = FIELDS.reduce((s, f) => s + ((day?.[f.key] as number) || 0), 0)
            return (
              <div key={dow} style={{ borderLeft: '1px solid #1F1F1F', padding: '10px 4px', textAlign: 'center', background: isToday ? '#111111' : 'transparent' }}>
                <span style={{ ...mono, fontSize: 12, color: total > 0 ? '#22C55E' : '#333333', fontWeight: total > 0 ? 600 : 400 }}>{total}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#555555', marginTop: 12 }}>
        Click + / − to log your daily activity. Data is saved automatically and persists across sessions.
      </div>
    </div>
  )
}
