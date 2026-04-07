'use client'
import { useState } from 'react'
import { S, type Scorecard } from '../shared'

const FIELDS = [
  { key: 'calls_made', label: 'Calls Made', color: S.green },
  { key: 'dms_sent', label: 'DMs Sent', color: S.accent },
  { key: 'emails_sent', label: 'Emails Sent', color: S.purple },
  { key: 'prospects_added', label: 'Prospects Added', color: S.orange },
  { key: 'follow_ups_done', label: 'Follow-ups Done', color: '#06B6D4' },
  { key: 'appointments_set', label: 'Appointments Set', color: '#8B5CF6' },
  { key: 'conversions', label: 'Conversions', color: S.green },
  { key: 'communities_posted', label: 'Community Posts', color: '#EC4899' },
] as const

type Props = {
  scorecards: Scorecard[]
  onUpdate: (s: Scorecard[]) => void
}

export default function ScorecardTab({ scorecards, onUpdate }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const todayCard = scorecards.find(s => s.score_date === today)
  const [notes, setNotes] = useState(todayCard?.notes || '')
  const [saving, setSaving] = useState(false)

  async function increment(field: string, delta: number) {
    // Optimistic update
    const current = todayCard ? { ...todayCard } : {
      id: 'temp', score_date: today, calls_made: 0, dms_sent: 0, emails_sent: 0,
      prospects_added: 0, follow_ups_done: 0, appointments_set: 0, conversions: 0,
      communities_posted: 0, notes: null,
    } as Scorecard
    const currentVal = (current[field as keyof Scorecard] as number) || 0
    const updated = { ...current, [field]: Math.max(0, currentVal + delta) }

    if (todayCard) {
      onUpdate(scorecards.map(s => s.score_date === today ? updated : s))
    } else {
      onUpdate([updated, ...scorecards])
    }

    await fetch('/api/admin/genx/scorecard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score_date: today, field, delta }),
    })
  }

  async function saveNotes() {
    setSaving(true)
    const vals: Record<string, unknown> = { score_date: today, notes }
    // Include all current values to avoid resetting
    if (todayCard) {
      for (const f of FIELDS) vals[f.key] = todayCard[f.key as keyof Scorecard]
    }
    await fetch('/api/admin/genx/scorecard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vals),
    })
    setSaving(false)
  }

  // Weekly totals (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const weekCards = scorecards.filter(s => s.score_date >= weekAgo)
  const weekTotals: Record<string, number> = {}
  for (const f of FIELDS) {
    weekTotals[f.key] = weekCards.reduce((s, c) => s + ((c[f.key as keyof Scorecard] as number) || 0), 0)
  }

  // Get value for today
  function getVal(field: string): number {
    if (!todayCard) return 0
    return (todayCard[field as keyof Scorecard] as number) || 0
  }

  return (
    <div>
      {/* Today's Scorecard - main interaction area */}
      <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>
            Today — {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <div style={{ fontSize: 13, color: S.textSecondary }}>
            Total activities: {FIELDS.reduce((s, f) => s + getVal(f.key), 0)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {FIELDS.map(f => (
            <div key={f.key} style={{ background: S.bg, borderRadius: S.radius, border: `1px solid ${S.border}`, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 10, fontWeight: 500 }}>{f.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => increment(f.key, -1)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', border: `1px solid ${S.border}`,
                    background: S.surface, fontSize: 18, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: S.textSecondary,
                  }}
                >
                  -
                </button>
                <div style={{ fontSize: 32, fontWeight: 700, color: f.color }}>{getVal(f.key)}</div>
                <button
                  onClick={() => increment(f.key, 1)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', border: `1px solid ${f.color}40`,
                    background: `${f.color}10`, fontSize: 18, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: f.color,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Notes for today */}
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <input
            placeholder="Notes for today..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveNotes()}
            style={{ flex: 1, border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '10px 14px', fontSize: 13 }}
          />
          <button onClick={saveNotes} disabled={saving}
            style={{ background: S.accent, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Weekly summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, marginBottom: 16 }}>This Week</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FIELDS.map(f => {
              const val = weekTotals[f.key] || 0
              const max = Math.max(...Object.values(weekTotals), 1)
              return (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 120, fontSize: 12, color: S.textSecondary }}>{f.label}</div>
                  <div style={{ flex: 1, height: 20, background: S.bg, borderRadius: 4, overflow: 'hidden', border: `1px solid ${S.borderLight}` }}>
                    <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: f.color, borderRadius: 4, opacity: 0.7, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ width: 32, textAlign: 'right', fontSize: 13, fontWeight: 600, color: f.color }}>{val}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* History */}
        <div style={{ background: S.surface, borderRadius: S.radius, border: `1px solid ${S.border}`, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, marginBottom: 16 }}>Recent Days</h3>
          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            {scorecards.slice(0, 14).map(s => {
              const total = FIELDS.reduce((sum, f) => sum + ((s[f.key as keyof Scorecard] as number) || 0), 0)
              const dayLabel = new Date(s.score_date + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
              return (
                <div key={s.score_date} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderBottom: `1px solid ${S.borderLight}`,
                  background: s.score_date === today ? S.accentLight : 'transparent',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: s.score_date === today ? 600 : 400, color: S.text }}>{dayLabel}</div>
                    <div style={{ fontSize: 11, color: S.textMuted, display: 'flex', gap: 8, marginTop: 2 }}>
                      {FIELDS.filter(f => (s[f.key as keyof Scorecard] as number) > 0).map(f => (
                        <span key={f.key} style={{ color: f.color }}>{(s[f.key as keyof Scorecard] as number)} {f.label.split(' ')[0]}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: total > 0 ? S.green : S.textMuted }}>{total}</div>
                </div>
              )
            })}
            {scorecards.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: S.textMuted, fontSize: 13 }}>No scorecard data yet. Start tracking above!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
