'use client'
import { useState } from 'react'
import { S, type LG, type Payout, type ProspectActivity, type Scorecard } from '../shared'

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', contacted: 'Contacted', interested: 'Interested',
  scheduled: 'Scheduled', converted: 'Converted', lost: 'Lost',
}
const STAGE_COLORS: Record<string, string> = {
  lead: S.textSecondary, contacted: S.accent, interested: S.purple,
  scheduled: S.orange, converted: S.green, lost: S.red,
}

type Props = {
  dashboardData: {
    kpis: Record<string, number | string>
    pipeline: Record<string, number>
    today_scorecard: Scorecard | null
    recent_activities: ProspectActivity[]
  } | null
  lgs: LG[]
  pendingPayouts: Payout[]
  onRefresh: () => void
}

export default function DashboardTab({ dashboardData, lgs, pendingPayouts, onRefresh }: Props) {
  const [payRef, setPayRef] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string | null>(null)

  const kpis = dashboardData?.kpis || {}
  const pipeline = dashboardData?.pipeline || {}
  const todayScore = dashboardData?.today_scorecard
  const recentActivities = dashboardData?.recent_activities || []

  async function markPaid(payoutId: string) {
    setLoading(payoutId)
    await fetch('/api/admin/genx/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payout_id: payoutId, payment_reference: payRef[payoutId] || '' }),
    })
    setLoading(null)
    onRefresh()
  }

  async function action(lgId: string, type: 'approve' | 'pause' | 'deactivate') {
    setLoading(lgId + type)
    await fetch(`/api/admin/genx/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lg_id: lgId }),
    })
    setLoading(null)
    onRefresh()
  }

  // Max for funnel bar width calculation
  const maxPipeline = Math.max(...Object.values(pipeline), 1)

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Active LGs', value: kpis.active_lgs ?? 0, color: S.green },
          { label: 'Active Prospects', value: kpis.active_prospects ?? 0, color: S.accent },
          { label: 'Conversion Rate', value: `${kpis.conversion_rate ?? 0}%`, color: S.purple },
          { label: 'Month Earnings', value: `$${Number(kpis.month_earnings ?? 0).toFixed(2)}`, color: S.green },
          { label: 'Overdue Follow-ups', value: kpis.overdue_follow_ups ?? 0, color: Number(kpis.overdue_follow_ups) > 0 ? S.red : S.textSecondary },
        ].map(card => (
          <div key={card.label} style={{ background: S.surface, borderRadius: S.radius, padding: '18px 20px', border: `1px solid ${S.border}` }}>
            <div style={{ fontSize: 12, color: S.textSecondary, marginBottom: 8, fontWeight: 500 }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Pipeline Funnel */}
        <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Pipeline Funnel</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(STAGE_LABELS).filter(([k]) => k !== 'lost').map(([stage, label]) => {
              const count = pipeline[stage] || 0
              const pct = maxPipeline > 0 ? (count / maxPipeline) * 100 : 0
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 90, fontSize: 13, color: S.textSecondary, fontWeight: 500 }}>{label}</div>
                  <div style={{ flex: 1, height: 28, background: S.bg, borderRadius: 6, overflow: 'hidden', border: `1px solid ${S.borderLight}` }}>
                    <div style={{
                      width: `${Math.max(pct, count > 0 ? 8 : 0)}%`,
                      height: '100%',
                      background: STAGE_COLORS[stage] || S.accent,
                      borderRadius: 6,
                      transition: 'width 0.3s',
                      opacity: 0.8,
                    }} />
                  </div>
                  <div style={{ width: 32, textAlign: 'right', fontSize: 14, fontWeight: 600, color: STAGE_COLORS[stage] }}>{count}</div>
                </div>
              )
            })}
            {/* Lost separate */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6, marginTop: 4 }}>
              <div style={{ width: 90, fontSize: 13, color: S.red, fontWeight: 500 }}>Lost</div>
              <div style={{ flex: 1 }} />
              <div style={{ width: 32, textAlign: 'right', fontSize: 14, fontWeight: 600, color: S.red }}>{pipeline['lost'] || 0}</div>
            </div>
          </div>
        </div>

        {/* Today's Scorecard */}
        <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Today&apos;s Activity</h3>
          {todayScore ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'Calls', value: todayScore.calls_made },
                { label: 'DMs', value: todayScore.dms_sent },
                { label: 'Emails', value: todayScore.emails_sent },
                { label: 'Prospects Added', value: todayScore.prospects_added },
                { label: 'Follow-ups', value: todayScore.follow_ups_done },
                { label: 'Appointments', value: todayScore.appointments_set },
                { label: 'Conversions', value: todayScore.conversions },
                { label: 'Community Posts', value: todayScore.communities_posted },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}` }}>
                  <span style={{ fontSize: 13, color: S.textSecondary }}>{item.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: (item.value || 0) > 0 ? S.green : S.textMuted }}>{item.value || 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>
              No activity logged today yet. Go to the Scorecard tab to start tracking.
            </div>
          )}
        </div>
      </div>

      {/* Two-column: Pending Actions + Activity Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Pending Actions */}
        <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Pending Actions</h3>

          {/* Pending approvals */}
          {lgs.filter(l => l.status === 'pending').map(lg => (
            <div key={lg.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: S.yellowLight, borderRadius: S.radiusSm, marginBottom: 8, border: `1px solid #FDE68A` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{lg.display_name}</div>
                <div style={{ fontSize: 11, color: S.textSecondary }}>Wacht op goedkeuring</div>
              </div>
              <button
                onClick={() => action(lg.id, 'approve')}
                disabled={loading === lg.id + 'approve'}
                style={{ background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {loading === lg.id + 'approve' ? '...' : 'Approve'}
              </button>
            </div>
          ))}

          {/* Pending payouts */}
          {pendingPayouts.map(p => {
            const lg = lgs.find(l => l.id === p.lg_id)
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: S.greenLight, borderRadius: S.radiusSm, marginBottom: 8, border: `1px solid #A7F3D0` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{lg?.display_name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: S.textSecondary }}>${parseFloat(String(p.amount)).toFixed(2)} — {p.period_start}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    placeholder="Ref"
                    value={payRef[p.id] || ''}
                    onChange={e => setPayRef(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '4px 8px', fontSize: 11, width: 100 }}
                  />
                  <button
                    onClick={() => markPaid(p.id)}
                    disabled={loading === p.id}
                    style={{ background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {loading === p.id ? '...' : 'Paid'}
                  </button>
                </div>
              </div>
            )
          })}

          {lgs.filter(l => l.status === 'pending').length === 0 && pendingPayouts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: S.textMuted, fontSize: 13 }}>No pending actions</div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Recent Activity</h3>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {recentActivities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: S.textMuted, fontSize: 13 }}>No recent activity</div>
            ) : recentActivities.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${S.borderLight}` }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                  background: a.activity_type === 'status_change' ? S.accent :
                    a.activity_type === 'call' ? S.green :
                    a.activity_type === 'dm' ? S.purple : S.textMuted,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: S.text }}>
                    <strong>{a.admin_prospects?.name || 'Prospect'}</strong>{' — '}
                    {a.description || a.activity_type}
                  </div>
                  <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2 }}>
                    {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
