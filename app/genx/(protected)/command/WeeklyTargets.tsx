'use client'
import { useState } from 'react'

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
}

type Props = {
  lgId: string
  weeklySignups: number
  weeklyActivations: number
  targetSignups: number
  targetActivations: number
}

export default function WeeklyTargets({ lgId: _, weeklySignups, weeklyActivations, targetSignups: initTS, targetActivations: initTA }: Props) {
  const [targetSignups, setTargetSignups] = useState(initTS)
  const [targetActivations, setTargetActivations] = useState(initTA)
  const [editingSignups, setEditingSignups] = useState(false)
  const [editingActivations, setEditingActivations] = useState(false)
  const [saving, setSaving] = useState(false)

  // Get current week number
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)

  async function saveTarget(field: 'signups' | 'activations', value: number) {
    setSaving(true)
    await fetch('/api/genx/targets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field === 'signups' ? 'weekly_target_signups' : 'weekly_target_activations']: value }),
    })
    setSaving(false)
    if (field === 'signups') setEditingSignups(false)
    else setEditingActivations(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={S.label}>This Week</span>
        <span style={{ ...S.mono, fontSize: 11, color: '#555555' }}>Week {weekNum}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Sign-ups */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#888888' }}>Sign-ups</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...S.mono, fontSize: 12, color: '#FFFFFF' }}>{weeklySignups}</span>
              <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>/</span>
              {editingSignups ? (
                <input
                  type="number" defaultValue={targetSignups} min={1} max={100} autoFocus
                  onBlur={async (e) => { const v = parseInt(e.target.value)||targetSignups; setTargetSignups(v); await saveTarget('signups', v) }}
                  onKeyDown={async (e) => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value)||targetSignups; setTargetSignups(v); await saveTarget('signups', v) }}}
                  style={{ ...S.mono, width: 40, background: '#1F1F1F', border: '1px solid #333', borderRadius: 4, color: '#FFFFFF', fontSize: 12, padding: '2px 6px', textAlign: 'center' }}
                />
              ) : (
                <button onClick={() => setEditingSignups(true)} disabled={saving} style={{ ...S.mono, fontSize: 12, color: '#555555', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline dotted' }}>
                  {targetSignups}
                </button>
              )}
            </div>
          </div>
          <div style={{ height: 4, background: '#1F1F1F', borderRadius: 2 }}>
            <div style={{ height: 4, background: '#FFFFFF', borderRadius: 2, width: `${Math.min(100, Math.round((weeklySignups / targetSignups) * 100))}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
        {/* Activations */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#888888' }}>Activations</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...S.mono, fontSize: 12, color: '#FFFFFF' }}>{weeklyActivations}</span>
              <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>/</span>
              {editingActivations ? (
                <input
                  type="number" defaultValue={targetActivations} min={1} max={100} autoFocus
                  onBlur={async (e) => { const v = parseInt(e.target.value)||targetActivations; setTargetActivations(v); await saveTarget('activations', v) }}
                  onKeyDown={async (e) => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value)||targetActivations; setTargetActivations(v); await saveTarget('activations', v) }}}
                  style={{ ...S.mono, width: 40, background: '#1F1F1F', border: '1px solid #333', borderRadius: 4, color: '#FFFFFF', fontSize: 12, padding: '2px 6px', textAlign: 'center' }}
                />
              ) : (
                <button onClick={() => setEditingActivations(true)} disabled={saving} style={{ ...S.mono, fontSize: 12, color: '#555555', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline dotted' }}>
                  {targetActivations}
                </button>
              )}
            </div>
          </div>
          <div style={{ height: 4, background: '#1F1F1F', borderRadius: 2 }}>
            <div style={{ height: 4, background: '#FFFFFF', borderRadius: 2, width: `${Math.min(100, Math.round((weeklyActivations / targetActivations) * 100))}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
