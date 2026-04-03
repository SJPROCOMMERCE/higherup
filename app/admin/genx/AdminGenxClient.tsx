'use client'
import { useState } from 'react'

type LG = {
  id: string; display_name: string; email: string | null; login_code: string
  referral_code: string; status: string; total_earnings: number; total_referred: number
  active_referred: number; referral_count: number; created_at: string; approved_at: string | null
}
type Payout = { id: string; lg_id: string; billing_month: string; payout_amount: number; status: string }

const STATUS_COLORS: Record<string, string> = {
  active: '#22C55E', pending: '#F59E0B', paused: '#888888', deactivated: '#EF4444'
}

export default function AdminGenxClient({ lgs, pendingPayouts }: { lgs: LG[]; pendingPayouts: Payout[] }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [payRef, setPayRef] = useState<Record<string, string>>({})

  const totalActive = lgs.filter(l => l.status === 'active').length
  const totalPending = lgs.filter(l => l.status === 'pending').length
  const totalEarnings = lgs.reduce((s, l) => s + parseFloat(String(l.total_earnings || 0)), 0)
  const totalVAs = lgs.reduce((s, l) => s + (l.total_referred || 0), 0)

  async function action(lgId: string, type: 'approve' | 'pause' | 'deactivate') {
    setLoading(lgId + type)
    await fetch(`/api/admin/genx/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lg_id: lgId }),
    })
    setLoading(null)
    window.location.reload()
  }

  async function markPaid(payoutId: string, lgId: string) {
    setLoading(payoutId)
    await fetch('/api/admin/genx/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payout_id: payoutId, payment_reference: payRef[payoutId] || '' }),
    })
    setLoading(null)
    window.location.reload()
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>GENX — Lead Generator Management</h1>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Active LGs', value: totalActive },
          { label: 'Pending Approval', value: totalPending },
          { label: 'Total VAs Referred', value: totalVAs },
          { label: 'Total LG Earnings', value: `$${totalEarnings.toFixed(2)}` },
        ].map(card => (
          <div key={card.label} style={{ background: '#F5F5F7', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, color: '#86868B', marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Pending payouts */}
      {pendingPayouts.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Pending Payouts ({pendingPayouts.length})</h2>
          <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>
            {pendingPayouts.map((p, i) => {
              const lg = lgs.find(l => l.id === p.lg_id)
              return (
                <div key={p.id} style={{ padding: '16px 20px', borderBottom: i < pendingPayouts.length - 1 ? '1px solid #F0F0F0' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{lg?.display_name || p.lg_id}</div>
                    <div style={{ fontSize: 12, color: '#86868B' }}>{p.billing_month}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#22C55E' }}>${parseFloat(String(p.payout_amount)).toFixed(2)}</span>
                    <input
                      placeholder="Reference"
                      value={payRef[p.id] || ''}
                      onChange={e => setPayRef(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ border: '1px solid #E5E5E5', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: 140 }}
                    />
                    <button onClick={() => markPaid(p.id, p.lg_id)} disabled={loading === p.id} style={{
                      background: '#22C55E', color: '#fff', border: 'none', borderRadius: 6,
                      padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                      {loading === p.id ? '...' : 'Mark Paid'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* All LGs */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>All Lead Generators ({lgs.length})</h2>
      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>
        {lgs.map((lg, i) => (
          <div key={lg.id} style={{ padding: '16px 20px', borderBottom: i < lgs.length - 1 ? '1px solid #F0F0F0' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{lg.display_name}</span>
                  <span style={{ fontSize: 11, color: STATUS_COLORS[lg.status] || '#888', textTransform: 'uppercase', fontWeight: 600 }}>{lg.status}</span>
                </div>
                <div style={{ fontSize: 12, color: '#86868B' }}>
                  {lg.email} · Code: <strong>{lg.login_code}</strong> · Ref: {lg.referral_code}
                </div>
                <div style={{ fontSize: 12, color: '#86868B', marginTop: 4 }}>
                  {lg.total_referred} referred · {lg.active_referred} active · ${parseFloat(String(lg.total_earnings || 0)).toFixed(2)} lifetime
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {lg.status === 'pending' && (
                  <button onClick={() => action(lg.id, 'approve')} disabled={loading === lg.id + 'approve'} style={{
                    background: '#22C55E', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Approve</button>
                )}
                {lg.status === 'active' && (
                  <button onClick={() => action(lg.id, 'pause')} disabled={loading === lg.id + 'pause'} style={{
                    background: '#F5F5F7', color: '#1D1D1F', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                  }}>Pause</button>
                )}
                {lg.status !== 'deactivated' && (
                  <button onClick={() => action(lg.id, 'deactivate')} disabled={loading === lg.id + 'deactivate'} style={{
                    background: '#FEF2F2', color: '#EF4444', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                  }}>Deactivate</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
