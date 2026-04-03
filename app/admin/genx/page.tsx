'use client'

import { useEffect, useState } from 'react'

type LG = {
  id: string; display_name: string; email: string | null; referral_code: string
  status: string; total_referred: number; active_referred: number
  total_earnings: number; created_at: string; approved_at: string | null
  this_month_earnings: number; pending_payout: number; login_code: string
}

type Summary = {
  active_lgs: number; pending_lgs: number
  this_month_earnings: number; pending_payouts: number
}

const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

function statusColor(s: string) {
  if (s === 'active')      return '#22C55E'
  if (s === 'pending')     return '#F59E0B'
  if (s === 'paused')      return '#888888'
  if (s === 'deactivated') return '#EF4444'
  return '#888888'
}

export default function AdminGenxPage() {
  const [lgs,     setLgs]     = useState<LG[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<'all' | 'pending' | 'active'>('all')
  const [action,  setAction]  = useState<{ type: string; lgId: string; lgName: string } | null>(null)
  const [payRef,  setPayRef]  = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/genx')
    if (res.ok) {
      const d = await res.json()
      setLgs(d.lgs || [])
      setSummary(d.summary)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function doAction(type: string, lgId: string, payoutId?: string) {
    const endpoints: Record<string, string> = {
      approve:    '/api/admin/genx/approve',
      pause:      '/api/admin/genx/pause',
      deactivate: '/api/admin/genx/deactivate',
      pay:        '/api/admin/genx/pay',
    }
    const body = type === 'pay'
      ? { payout_id: payoutId, payment_reference: payRef }
      : { lg_id: lgId }
    await fetch(endpoints[type], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setAction(null); setPayRef('')
    load()
  }

  const filtered = lgs.filter(lg => {
    if (filter === 'all')     return true
    if (filter === 'pending') return lg.status === 'pending'
    if (filter === 'active')  return lg.status === 'active'
    return true
  })

  const td: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #F0F0F0', fontSize: 13, verticalAlign: 'middle' }
  const th: React.CSSProperties = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid #F0F0F0' }
  const btn = (color: string): React.CSSProperties => ({
    background: color, color: '#FFFFFF', border: 'none', borderRadius: 6,
    padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <div style={{ padding: '32px 32px 64px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111111', margin: '0 0 8px' }}>GENX — Lead Generators</h1>
      <p style={{ fontSize: 13, color: '#888888', margin: '0 0 32px' }}>Manage LG applications, approvals, and payouts</p>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Active LGs',         value: summary.active_lgs,          mono: false },
            { label: 'Pending approval',   value: summary.pending_lgs,          mono: false },
            { label: 'This month earnings',value: `$${summary.this_month_earnings.toFixed(2)}`, mono: true },
            { label: 'Pending payouts',    value: `$${summary.pending_payouts.toFixed(2)}`,    mono: true },
          ].map(c => (
            <div key={c.label} style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 11, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#111111', fontFamily: c.mono ? "'JetBrains Mono', monospace" : 'inherit' }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'pending', 'active'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#111111' : '#F5F5F5',
            color: filter === f ? '#FFFFFF' : '#555555',
            border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && summary?.pending_lgs ? ` (${summary.pending_lgs})` : ''}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: '#888888', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Status', 'Referral Code', 'Referred', 'This Month', 'Lifetime', 'Pending Payout', 'Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, color: '#888888', textAlign: 'center', padding: 32 }}>No lead generators found</td></tr>
              )}
              {filtered.map(lg => (
                <tr key={lg.id} style={{ background: '#FFFFFF' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 500, color: '#111111' }}>{lg.display_name}</div>
                    {lg.email && <div style={{ fontSize: 11, color: '#888888', marginTop: 2 }}>{lg.email}</div>}
                    <div style={{ fontSize: 10, color: '#CCCCCC', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>code: {lg.login_code}</div>
                  </td>
                  <td style={td}>
                    <span style={{ color: statusColor(lg.status), fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {lg.status}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{lg.referral_code}</span>
                    <div style={{ fontSize: 11, color: '#CCCCCC', marginTop: 2 }}>{baseUrl}/ref/{lg.referral_code}</div>
                  </td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>
                    {lg.total_referred} total<br />
                    <span style={{ color: '#22C55E' }}>{lg.active_referred} active</span>
                  </td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>${(lg.this_month_earnings || 0).toFixed(2)}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>${parseFloat(String(lg.total_earnings || 0)).toFixed(2)}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: (lg.pending_payout || 0) > 0 ? '#F59E0B' : '#888888' }}>
                      ${(lg.pending_payout || 0).toFixed(2)}
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {lg.status === 'pending' && (
                        <button style={btn('#22C55E')} onClick={() => doAction('approve', lg.id)}>Approve</button>
                      )}
                      {lg.status === 'active' && (
                        <button style={btn('#888888')} onClick={() => doAction('pause', lg.id)}>Pause</button>
                      )}
                      {lg.status === 'paused' && (
                        <button style={btn('#22C55E')} onClick={() => doAction('approve', lg.id)}>Reactivate</button>
                      )}
                      {lg.status !== 'deactivated' && (
                        <button style={btn('#EF4444')} onClick={() => setAction({ type: 'deactivate', lgId: lg.id, lgName: lg.display_name })}>
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deactivate confirm modal */}
      {action?.type === 'deactivate' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 32, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Deactivate {action.lgName}?</h3>
            <p style={{ fontSize: 13, color: '#555555', margin: '0 0 24px' }}>This will disable their GENX access. Existing earnings are preserved.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAction(null)} style={{ background: '#F5F5F5', color: '#555555', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => doAction('deactivate', action.lgId)} style={btn('#EF4444')}>Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
