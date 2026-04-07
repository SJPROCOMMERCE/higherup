'use client'
import { useState, useEffect } from 'react'
import { S, PIPELINE_STAGES, TERMINAL_STAGES, type LG, type Payout, type ProspectActivity, type Scorecard } from '../shared'

type FunnelStep = {
  stage: string; count: number; reached: number
  rate_from_previous: number | null; avg_hours: number | null
}
type FunnelResponse = {
  steps: FunnelStep[]
  overallRate: number
  bottleneck: { from: string; to: string; rate: number; drop_off: number; message: string } | null
  stuck: Record<string, number>
  terminal: Record<string, number>
  total: number
}

const STAGE_LOOKUP: Record<string, { label: string; color: string }> = {}
for (const s of PIPELINE_STAGES) STAGE_LOOKUP[s.key] = { label: s.label, color: s.color }
for (const s of TERMINAL_STAGES) STAGE_LOOKUP[s.key] = { label: s.label, color: s.color }

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
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(true)

  const kpis = dashboardData?.kpis || {}
  const pipeline = dashboardData?.pipeline || {}
  const todayScore = dashboardData?.today_scorecard
  const recentActivities = dashboardData?.recent_activities || []

  // Fetch funnel analytics data
  useEffect(() => {
    setFunnelLoading(true)
    fetch('/api/admin/genx/funnel')
      .then(r => r.json())
      .then(data => { setFunnel(data); setFunnelLoading(false) })
      .catch(() => setFunnelLoading(false))
  }, [])

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

  // Max for server-side pipeline bar width
  const maxPipeline = Math.max(...PIPELINE_STAGES.map(s => pipeline[s.key] || 0), 1)

  // Funnel max for funnel bars
  const maxReached = funnel ? Math.max(...funnel.steps.map(s => s.reached), 1) : 1

  // Total stuck
  const totalStuck = funnel ? Object.values(funnel.stuck).reduce((a, b) => a + b, 0) : 0

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

      {/* ── Recruitment Funnel ── */}
      <div style={{ background: S.surface, borderRadius: S.radius, padding: 24, border: `1px solid ${S.border}`, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>Recruitment Funnel</h3>
            <p style={{ fontSize: 12, color: S.textSecondary, margin: '4px 0 0' }}>
              Conversion rates across the 10-stage pipeline
              {funnel && <span style={{ marginLeft: 8, color: S.accent, fontWeight: 600 }}>{funnel.overallRate}% overall conversion</span>}
            </p>
          </div>
          {funnel && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <span style={{ color: S.textSecondary }}>Total: <strong style={{ color: S.text }}>{funnel.total}</strong></span>
              <span style={{ color: S.textSecondary }}>Terminal: <strong style={{ color: S.red }}>
                {funnel.terminal ? Object.values(funnel.terminal).reduce((a, b) => a + b, 0) : 0}
              </strong></span>
            </div>
          )}
        </div>

        {funnelLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>Loading funnel data...</div>
        ) : !funnel ? (
          /* Fallback: use server-side pipeline counts */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PIPELINE_STAGES.map(stage => {
              const count = pipeline[stage.key] || 0
              const pct = maxPipeline > 0 ? (count / maxPipeline) * 100 : 0
              return (
                <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 110, fontSize: 13, color: S.textSecondary, fontWeight: 500 }}>{stage.label}</div>
                  <div style={{ flex: 1, height: 28, background: S.bg, borderRadius: 6, overflow: 'hidden', border: `1px solid ${S.borderLight}` }}>
                    <div style={{
                      width: `${Math.max(pct, count > 0 ? 6 : 0)}%`,
                      height: '100%', background: stage.color, borderRadius: 6, opacity: 0.75, transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ width: 36, textAlign: 'right', fontSize: 14, fontWeight: 600, color: stage.color }}>{count}</div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Full funnel with conversion rates */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {funnel.steps.map((step, i) => {
              const meta = STAGE_LOOKUP[step.stage] || { label: step.stage, color: S.textSecondary }
              const pct = maxReached > 0 ? (step.reached / maxReached) * 100 : 0
              const isBottleneck = funnel.bottleneck && funnel.bottleneck.to === step.stage

              return (
                <div key={step.stage}>
                  {/* Conversion arrow between stages */}
                  {i > 0 && step.rate_from_previous !== null && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '3px 0 3px 122px', fontSize: 11,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M6 2 L6 10 M3 7 L6 10 L9 7" stroke={isBottleneck ? S.red : S.textMuted} fill="none" strokeWidth="1.5" />
                      </svg>
                      <span style={{
                        color: isBottleneck ? S.red : step.rate_from_previous >= 60 ? S.green : step.rate_from_previous >= 30 ? S.yellow : S.red,
                        fontWeight: 600,
                      }}>
                        {step.rate_from_previous}%
                      </span>
                      {step.avg_hours !== null && (
                        <span style={{ color: S.textMuted, fontWeight: 400 }}>
                          · avg {step.avg_hours < 24 ? `${step.avg_hours}h` : `${Math.round(step.avg_hours / 24)}d`}
                        </span>
                      )}
                      {isBottleneck && (
                        <span style={{
                          background: S.redLight, color: S.red, padding: '1px 8px',
                          borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                        }}>BOTTLENECK</span>
                      )}
                    </div>
                  )}

                  {/* Stage bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 110, fontSize: 13, color: S.textSecondary, fontWeight: 500 }}>{meta.label}</div>
                    <div style={{
                      flex: 1, height: 32, background: S.bg, borderRadius: 6,
                      overflow: 'hidden', border: `1px solid ${S.borderLight}`, position: 'relative',
                    }}>
                      <div style={{
                        width: `${Math.max(pct, step.reached > 0 ? 4 : 0)}%`,
                        height: '100%', background: meta.color, borderRadius: 6,
                        opacity: 0.75, transition: 'width 0.4s ease',
                      }} />
                      {/* Current count inside bar */}
                      {step.count > 0 && (
                        <div style={{
                          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 11, fontWeight: 600, color: pct > 15 ? '#fff' : S.text, textShadow: pct > 15 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                        }}>
                          {step.count} now
                        </div>
                      )}
                    </div>
                    <div style={{ width: 48, textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{step.reached}</div>
                      <div style={{ fontSize: 9, color: S.textMuted, marginTop: -1 }}>reached</div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Terminal stages row */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${S.borderLight}` }}>
              {TERMINAL_STAGES.map(ts => (
                <div key={ts.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                  background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ts.color }} />
                  <span style={{ fontSize: 12, color: S.textSecondary }}>{ts.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ts.color }}>
                    {funnel.terminal?.[ts.key] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottleneck Alert ── */}
      {funnel?.bottleneck && (
        <div style={{
          background: S.redLight, border: `1px solid #FECACA`, borderRadius: S.radius,
          padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{ fontSize: 22, lineHeight: 1 }}>⚠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: S.red, marginBottom: 4 }}>
              Bottleneck Detected: {STAGE_LOOKUP[funnel.bottleneck.from]?.label || funnel.bottleneck.from} → {STAGE_LOOKUP[funnel.bottleneck.to]?.label || funnel.bottleneck.to}
            </div>
            <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5 }}>
              {funnel.bottleneck.message}
            </div>
            <div style={{ fontSize: 12, color: S.textSecondary, marginTop: 6 }}>
              Only <strong>{funnel.bottleneck.rate}%</strong> make it through · <strong>{funnel.bottleneck.drop_off}%</strong> drop-off
            </div>
          </div>
        </div>
      )}

      {/* ── Velocity & Stuck: Two columns ── */}
      {funnel && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Velocity Metrics */}
          <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: S.text }}>Stage Velocity</h3>
            <p style={{ fontSize: 12, color: S.textSecondary, marginBottom: 14, marginTop: -8 }}>Average time between stages</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {funnel.steps.slice(1).filter(s => s.avg_hours !== null).map(step => {
                const meta = STAGE_LOOKUP[step.stage] || { label: step.stage, color: S.textSecondary }
                const prevIdx = funnel.steps.findIndex(s => s.stage === step.stage) - 1
                const prevMeta = prevIdx >= 0 ? (STAGE_LOOKUP[funnel.steps[prevIdx].stage] || { label: '?', color: S.textSecondary }) : null
                const hours = step.avg_hours!
                const days = hours / 24
                const isGood = days < 2
                const isBad = days > 7

                return (
                  <div key={step.stage} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}`,
                  }}>
                    <div style={{ flex: 1, fontSize: 12, color: S.textSecondary }}>
                      {prevMeta?.label} → {meta.label}
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: isBad ? S.red : isGood ? S.green : S.yellow,
                    }}>
                      {hours < 24 ? `${hours}h` : `${days.toFixed(1)}d`}
                    </div>
                  </div>
                )
              })}
              {funnel.steps.slice(1).filter(s => s.avg_hours !== null).length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: S.textMuted, fontSize: 13 }}>
                  No velocity data yet — need at least 2 prospects to have moved between stages.
                </div>
              )}
            </div>
          </div>

          {/* Stuck Prospects */}
          <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: 0 }}>Stuck Prospects</h3>
              {totalStuck > 0 && (
                <span style={{
                  background: S.redLight, color: S.red, padding: '3px 10px',
                  borderRadius: 12, fontSize: 12, fontWeight: 700,
                }}>{totalStuck} stuck</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: S.textSecondary, marginBottom: 14, marginTop: -8 }}>Prospects on same stage for 7+ days</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PIPELINE_STAGES.slice(0, -1).map(stage => {
                const count = funnel.stuck[stage.key] || 0
                if (count === 0) return null
                return (
                  <div key={stage.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: count >= 3 ? S.redLight : S.yellowLight,
                    borderRadius: S.radiusSm, border: `1px solid ${count >= 3 ? '#FECACA' : '#FDE68A'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                      <span style={{ fontSize: 13, color: S.text, fontWeight: 500 }}>{stage.label}</span>
                    </div>
                    <span style={{
                      fontSize: 14, fontWeight: 700,
                      color: count >= 3 ? S.red : S.yellow,
                    }}>{count}</span>
                  </div>
                )
              }).filter(Boolean)}
              {totalStuck === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: S.textMuted, fontSize: 13 }}>
                  No stuck prospects — pipeline is flowing well!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column: Today's Activity + Pending Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
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

        {/* Pending Actions */}
        <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Pending Actions</h3>

          {/* Pending approvals */}
          {lgs.filter(l => l.status === 'pending').map(lg => (
            <div key={lg.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: S.yellowLight, borderRadius: S.radiusSm, marginBottom: 8, border: '1px solid #FDE68A' }}>
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
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: S.greenLight, borderRadius: S.radiusSm, marginBottom: 8, border: '1px solid #A7F3D0' }}>
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
      </div>

      {/* ── Recent Activity Feed (full width) ── */}
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
  )
}
