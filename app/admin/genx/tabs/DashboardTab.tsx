'use client'
import { useState, useEffect } from 'react'
import { S, PIPELINE_STAGES, TERMINAL_STAGES, LOSS_CATEGORY_COLORS, getLossReasonLabel, type LG, type Payout, type ProspectActivity, type Scorecard, type ResponseSpeedData, type LossAnalyticsData, type ReactivationData, type ReactivationCycle } from '../shared'

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

// Map loss reason id → category for color lookup
const LOSS_REASONS_CAT: Record<string, string> = {
  wants_fixed_fee: 'pricing', thinks_scam: 'trust', thinks_mlm: 'trust',
  no_network: 'qualification', no_time: 'commitment', no_reply_5plus: 'engagement',
  no_reply_initial: 'engagement', uses_competitor: 'competition',
  not_interested_listing: 'qualification', too_complicated: 'education',
  bad_timing: 'timing', other: 'other',
}

function waitingColor(minutes: number): string {
  if (minutes < 60) return S.green
  if (minutes < 240) return S.yellow
  if (minutes < 1440) return S.orange
  return S.red
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
  onUnrepliedCount?: (count: number) => void
}

export default function DashboardTab({ dashboardData, lgs, pendingPayouts, onRefresh, onUnrepliedCount }: Props) {
  const [payRef, setPayRef] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(true)
  const [speed, setSpeed] = useState<ResponseSpeedData | null>(null)
  const [lossData, setLossData] = useState<LossAnalyticsData | null>(null)
  const [reactData, setReactData] = useState<ReactivationData | null>(null)
  const [reactLoading, setReactLoading] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // Reactivate modal
  const [reactModal, setReactModal] = useState<{ cycle: ReactivationCycle } | null>(null)
  const [reactStage, setReactStage] = useState('contacted')
  const [reactNote, setReactNote] = useState('')
  const [reactBy, setReactBy] = useState('')
  // Declined again modal
  const [declineModal, setDeclineModal] = useState<{ cycle: ReactivationCycle } | null>(null)
  const [declineSameReason, setDeclineSameReason] = useState(true)
  const [declineReason, setDeclineReason] = useState('')
  const [declineNote, setDeclineNote] = useState('')
  const [declineBy, setDeclineBy] = useState('')

  const kpis = dashboardData?.kpis || {}
  const pipeline = dashboardData?.pipeline || {}
  const todayScore = dashboardData?.today_scorecard
  const recentActivities = dashboardData?.recent_activities || []

  // Fetch funnel + response speed data
  useEffect(() => {
    setFunnelLoading(true)
    Promise.all([
      fetch('/api/admin/genx/funnel').then(r => r.json()).catch(() => null),
      fetch('/api/admin/genx/analytics/response-speed').then(r => r.json()).catch(() => null),
      fetch('/api/admin/genx/analytics/loss-reasons').then(r => r.json()).catch(() => null),
      fetch('/api/admin/genx/reactivation').then(r => r.json()).catch(() => null),
    ]).then(([funnelData, speedData, lossAnalytics, reactivation]) => {
      setFunnel(funnelData)
      setSpeed(speedData)
      setLossData(lossAnalytics)
      setReactData(reactivation)
      setFunnelLoading(false)
      if (speedData?.unreplied?.count != null) {
        onUnrepliedCount?.(speedData.unreplied.count)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll unreplied count every 60s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/genx/analytics/response-speed')
        const data = await res.json()
        setSpeed(data)
        onUnrepliedCount?.(data.unreplied?.count || 0)
      } catch { /* ignore */ }
    }, 60000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const maxPipeline = Math.max(...PIPELINE_STAGES.map(s => pipeline[s.key] || 0), 1)
  const maxReached = funnel ? Math.max(...funnel.steps.map(s => s.reached), 1) : 1
  const totalStuck = funnel ? Object.values(funnel.stuck).reduce((a, b) => a + b, 0) : 0

  // Trend chart max for bar heights
  const trendMax = speed?.trend?.length ? Math.max(...speed.trend.map(t => t.avg_minutes), 1) : 1

  return (
    <div>
      {/* ── UNREPLIED ALERT BANNER — always on top ── */}
      {speed && speed.unreplied.count > 0 && (
        <div style={{
          background: S.redLight, border: '1px solid #FECACA', borderRadius: S.radius,
          padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: S.red }}>
              {speed.unreplied.count} PROSPECT{speed.unreplied.count > 1 ? 'S' : ''} REPLIED AND {speed.unreplied.count > 1 ? 'ARE' : 'IS'} WAITING
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {speed.unreplied.prospects.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '8px 14px',
                background: '#fff', borderRadius: S.radiusSm, border: '1px solid #FECACA',
              }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: S.text }}>{p.name}</div>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: waitingColor(p.waiting_minutes),
                }}>{p.waiting_display}</div>
                {p.channel && (
                  <div style={{
                    fontSize: 10, fontWeight: 500, color: S.textSecondary,
                    background: S.surface, padding: '2px 8px', borderRadius: 4, textTransform: 'capitalize',
                  }}>{p.channel}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ── Response Speed Stats + Trend: Two columns ── */}
      {speed && speed.speed_stats.total_replies > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Speed Stats Card */}
          <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: 0 }}>Response Speed</h3>
              <span style={{ fontSize: 11, color: S.textMuted }}>Last 30 days</span>
            </div>

            <div style={{ fontSize: 28, fontWeight: 700, color: speed.speed_stats.avg_minutes <= 60 ? S.green : speed.speed_stats.avg_minutes <= 240 ? S.yellow : S.red, marginBottom: 16 }}>
              {speed.speed_stats.avg_display}
              <span style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, marginLeft: 8 }}>average</span>
            </div>

            {/* Percentage bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Within 5 min', pct: speed.speed_stats.within_5min_pct, count: speed.speed_stats.within_5min, color: S.green },
                { label: 'Within 1 hour', pct: speed.speed_stats.within_1hr_pct, count: speed.speed_stats.within_1hr, color: S.accent },
                { label: 'Within 24 hours', pct: speed.speed_stats.within_24hr_pct, count: speed.speed_stats.within_24hr, color: S.yellow },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 100, fontSize: 12, color: S.textSecondary }}>{row.label}</div>
                  <div style={{ width: 40, fontSize: 12, fontWeight: 700, color: row.color, textAlign: 'right' }}>{row.pct}%</div>
                  <div style={{ flex: 1, height: 18, background: S.bg, borderRadius: 4, overflow: 'hidden', border: `1px solid ${S.borderLight}` }}>
                    <div style={{ width: `${row.pct}%`, height: '100%', background: row.color, borderRadius: 4, opacity: 0.7, transition: 'width 0.3s' }} />
                  </div>
                </div>
              ))}
            </div>

            {speed.speed_stats.expired_count > 0 && (
              <div style={{ fontSize: 12, color: S.red, marginBottom: 12 }}>
                Expired (never replied): <strong>{speed.speed_stats.expired_count}</strong>
              </div>
            )}

            {/* Per person */}
            {Object.keys(speed.per_person).length > 0 && (
              <div style={{ borderTop: `1px solid ${S.borderLight}`, paddingTop: 12 }}>
                {Object.entries(speed.per_person).map(([name, stats]) => (
                  <div key={name} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 0', fontSize: 12,
                  }}>
                    <span style={{ color: S.text, fontWeight: 500, textTransform: 'capitalize' }}>{name}</span>
                    <span style={{ color: S.textSecondary }}>
                      avg <strong style={{ color: stats.avg_minutes <= 60 ? S.green : stats.avg_minutes <= 240 ? S.yellow : S.red }}>
                        {stats.avg_minutes < 60 ? `${stats.avg_minutes}m` : `${(stats.avg_minutes / 60).toFixed(1)}h`}
                      </strong>
                      <span style={{ marginLeft: 8, color: S.textMuted }}>{stats.count} replies</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Speed Trend Chart */}
          <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: 0 }}>Response Time Trend</h3>
              <span style={{ fontSize: 11, color: S.textMuted }}>Last 8 weeks</span>
            </div>

            {speed.trend.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: S.textMuted, fontSize: 13 }}>
                Not enough data for trend yet.
              </div>
            ) : (
              <div>
                {/* Bar chart */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 4px' }}>
                  {speed.trend.map(w => {
                    const barHeight = Math.max((w.avg_minutes / trendMax) * 140, 8)
                    const hours = w.avg_minutes / 60
                    const barColor = hours < 2 ? S.green : hours < 4 ? S.yellow : S.red
                    return (
                      <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: barColor }}>
                          {hours < 1 ? `${w.avg_minutes}m` : `${hours.toFixed(1)}h`}
                        </div>
                        <div style={{
                          width: '100%', height: barHeight, background: barColor,
                          borderRadius: '4px 4px 0 0', opacity: 0.75, transition: 'height 0.3s',
                        }} />
                        <div style={{ fontSize: 9, color: S.textMuted, whiteSpace: 'nowrap' }}>
                          {new Date(w.week).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Trend comparison */}
                {speed.trend.length >= 2 && (() => {
                  const recent = speed.trend[speed.trend.length - 1].avg_minutes
                  const prev = speed.trend[speed.trend.length - 2].avg_minutes
                  if (prev === 0) return null
                  const change = Math.round(((prev - recent) / prev) * 100)
                  return (
                    <div style={{ marginTop: 12, fontSize: 12, color: change > 0 ? S.green : S.red, fontWeight: 500 }}>
                      {change > 0 ? `${change}% faster` : `${Math.abs(change)}% slower`} than previous week
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {funnel.steps.map((step, i) => {
              const meta = STAGE_LOOKUP[step.stage] || { label: step.stage, color: S.textSecondary }
              const pct = maxReached > 0 ? (step.reached / maxReached) * 100 : 0
              const isBottleneck = funnel.bottleneck && funnel.bottleneck.to === step.stage

              return (
                <div key={step.stage}>
                  {i > 0 && step.rate_from_previous !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0 3px 122px', fontSize: 11 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M6 2 L6 10 M3 7 L6 10 L9 7" stroke={isBottleneck ? S.red : S.textMuted} fill="none" strokeWidth="1.5" />
                      </svg>
                      <span style={{
                        color: isBottleneck ? S.red : step.rate_from_previous >= 60 ? S.green : step.rate_from_previous >= 30 ? S.yellow : S.red,
                        fontWeight: 600,
                      }}>{step.rate_from_previous}%</span>
                      {step.avg_hours !== null && (
                        <span style={{ color: S.textMuted, fontWeight: 400 }}>
                          · avg {step.avg_hours < 24 ? `${step.avg_hours}h` : `${Math.round(step.avg_hours / 24)}d`}
                        </span>
                      )}
                      {isBottleneck && (
                        <span style={{ background: S.redLight, color: S.red, padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>BOTTLENECK</span>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 110, fontSize: 13, color: S.textSecondary, fontWeight: 500 }}>{meta.label}</div>
                    <div style={{ flex: 1, height: 32, background: S.bg, borderRadius: 6, overflow: 'hidden', border: `1px solid ${S.borderLight}`, position: 'relative' }}>
                      <div style={{
                        width: `${Math.max(pct, step.reached > 0 ? 4 : 0)}%`,
                        height: '100%', background: meta.color, borderRadius: 6, opacity: 0.75, transition: 'width 0.4s ease',
                      }} />
                      {step.count > 0 && (
                        <div style={{
                          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 11, fontWeight: 600, color: pct > 15 ? '#fff' : S.text, textShadow: pct > 15 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                        }}>{step.count} now</div>
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
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${S.borderLight}` }}>
              {TERMINAL_STAGES.map(ts => (
                <div key={ts.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ts.color }} />
                  <span style={{ fontSize: 12, color: S.textSecondary }}>{ts.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ts.color }}>{funnel.terminal?.[ts.key] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottleneck Alert ── */}
      {funnel?.bottleneck && (
        <div style={{ background: S.redLight, border: '1px solid #FECACA', borderRadius: S.radius, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ fontSize: 22, lineHeight: 1 }}>⚠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: S.red, marginBottom: 4 }}>
              Bottleneck Detected: {STAGE_LOOKUP[funnel.bottleneck.from]?.label || funnel.bottleneck.from} → {STAGE_LOOKUP[funnel.bottleneck.to]?.label || funnel.bottleneck.to}
            </div>
            <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5 }}>{funnel.bottleneck.message}</div>
            <div style={{ fontSize: 12, color: S.textSecondary, marginTop: 6 }}>
              Only <strong>{funnel.bottleneck.rate}%</strong> make it through · <strong>{funnel.bottleneck.drop_off}%</strong> drop-off
            </div>
          </div>
        </div>
      )}

      {/* ── Velocity & Stuck ── */}
      {funnel && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
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
                return (
                  <div key={step.stage} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}` }}>
                    <div style={{ flex: 1, fontSize: 12, color: S.textSecondary }}>{prevMeta?.label} → {meta.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: days > 7 ? S.red : days < 2 ? S.green : S.yellow }}>
                      {hours < 24 ? `${hours}h` : `${days.toFixed(1)}d`}
                    </div>
                  </div>
                )
              })}
              {funnel.steps.slice(1).filter(s => s.avg_hours !== null).length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: S.textMuted, fontSize: 13 }}>No velocity data yet.</div>
              )}
            </div>
          </div>

          <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: 0 }}>Stuck Prospects</h3>
              {totalStuck > 0 && (
                <span style={{ background: S.redLight, color: S.red, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{totalStuck} stuck</span>
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
                    <span style={{ fontSize: 14, fontWeight: 700, color: count >= 3 ? S.red : S.yellow }}>{count}</span>
                  </div>
                )
              }).filter(Boolean)}
              {totalStuck === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: S.textMuted, fontSize: 13 }}>No stuck prospects — pipeline is flowing well!</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Loss Analysis ── */}
      {lossData && lossData.total_lost > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Loss Reasons Breakdown */}
          <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: 0 }}>Why Prospects Say No</h3>
              <span style={{ fontSize: 11, color: S.textMuted }}>Last 30 days · {lossData.total_lost} lost</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {lossData.reasons.map((r, i) => {
                const catColor = LOSS_CATEGORY_COLORS[LOSS_REASONS_CAT[r.reason] || 'other'] || S.textMuted
                return (
                  <div key={r.reason} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 140, fontSize: 12, color: i === 0 ? S.text : S.textSecondary, fontWeight: i === 0 ? 600 : 400 }}>{r.label}</div>
                    <div style={{ width: 28, fontSize: 12, fontWeight: 600, color: catColor, textAlign: 'right' }}>{r.count}</div>
                    <div style={{ flex: 1, height: 18, background: S.bg, borderRadius: 4, overflow: 'hidden', border: `1px solid ${S.borderLight}` }}>
                      <div style={{ width: `${r.percentage}%`, height: '100%', background: catColor, borderRadius: 4, opacity: 0.7, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ width: 36, fontSize: 12, fontWeight: 700, color: catColor, textAlign: 'right' }}>{r.percentage}%</div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: S.textMuted }}>
              Avg {lossData.avg_days_in_pipeline} days in pipeline before loss
            </div>
            {/* Recommendations */}
            {lossData.recommendations.length > 0 && (
              <div style={{
                marginTop: 12, background: S.yellowLight, borderLeft: `4px solid ${S.yellow}`,
                borderRadius: `0 ${S.radiusSm}px ${S.radiusSm}px 0`, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: S.yellow, marginBottom: 4 }}>RECOMMENDATION</div>
                {lossData.recommendations.map((rec, i) => (
                  <div key={i} style={{ fontSize: 12, color: S.text, lineHeight: 1.5, marginBottom: i < lossData.recommendations.length - 1 ? 6 : 0 }}>{rec}</div>
                ))}
              </div>
            )}
          </div>

          {/* Losses by Channel + Reactivation Due */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* By Channel */}
            {Object.keys(lossData.by_channel).length > 0 && (
              <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: '0 0 12px' }}>Losses by Channel</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(lossData.by_channel)
                    .sort(([, a], [, b]) => Object.values(b).reduce((s, v) => s + v, 0) - Object.values(a).reduce((s, v) => s + v, 0))
                    .map(([channel, reasons]) => {
                      const total = Object.values(reasons).reduce((s, v) => s + v, 0)
                      const topEntry = Object.entries(reasons).sort(([, a], [, b]) => b - a)[0]
                      const topPct = topEntry ? Math.round((topEntry[1] / total) * 100) : 0
                      return (
                        <div key={channel} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: S.text, textTransform: 'capitalize' }}>{channel}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: S.red }}>{total} lost</span>
                          </div>
                          {topEntry && (
                            <span style={{ fontSize: 11, color: S.textSecondary }}>
                              Top: {getLossReasonLabel(topEntry[0])} ({topPct}%)
                            </span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Reactivation Due */}
            {lossData.reactivation_due.length > 0 && (
              <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: S.text, margin: 0 }}>Reactivation Due</h3>
                  <span style={{
                    background: S.greenLight, color: S.green, padding: '3px 10px',
                    borderRadius: 12, fontSize: 12, fontWeight: 700,
                  }}>{lossData.reactivation_due.length} ready</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lossData.reactivation_due.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: S.textSecondary }}>
                          {p.loss_reason_label} · {p.days_since_lost}d ago
                          {p.times_lost > 1 && <span style={{ color: S.orange }}> · lost {p.times_lost}x</span>}
                        </div>
                      </div>
                      <button onClick={async () => {
                        await fetch(`/api/admin/genx/prospects/${p.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ stage: 'identified', old_stage: 'lost', changed_by: 'admin' }),
                        })
                        onRefresh()
                      }}
                        style={{ background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REACTIVATION PIPELINE ── */}
      {reactData && (reactData.due_now.count > 0 || reactData.upcoming.count > 0 || reactData.stats.sent_last_30_days > 0) && (() => {
        function fillPlaceholders(template: string, prospectName: string) {
          const lgs = reactData!.platform_stats.active_lgs
          const topEarner = reactData!.platform_stats.top_earner_amount
          return template
            .replace(/\[name\]/g, prospectName || '[name]')
            .replace(/\[X\]/g, String(lgs))
            .replace(/\[Y\]/g, topEarner)
            .replace(/\[competitor[^\]]*\]/g, '[their alternative]')
        }

        async function execCycle(cycleId: string, action: string, extra?: Record<string, string>) {
          setReactLoading(cycleId)
          await fetch(`/api/admin/genx/reactivation/${cycleId}/execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra }),
          })
          // Refresh reactivation data
          const res = await fetch('/api/admin/genx/reactivation')
          setReactData(await res.json())
          setReactLoading(null)
        }

        async function copyMessage(cycleId: string, message: string, prospectName: string) {
          const filled = fillPlaceholders(message, prospectName)
          await navigator.clipboard.writeText(filled)
          setCopiedId(cycleId)
          setTimeout(() => setCopiedId(null), 2000)
        }

        const SENDERS = ['safouane', 'joep']

        return (
          <div style={{ background: S.surface, borderRadius: S.radius, padding: 24, border: `1px solid ${S.border}`, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>Reactivation Pipeline</h3>
                <p style={{ fontSize: 12, color: S.textSecondary, margin: '4px 0 0' }}>Follow up with lost prospects at the right time</p>
              </div>
              {reactData.due_now.count > 0 && (
                <span style={{
                  background: S.orangeLight, color: S.orange, padding: '4px 12px',
                  borderRadius: 12, fontSize: 13, fontWeight: 700,
                }}>{reactData.due_now.count} due now</span>
              )}
            </div>

            {/* Stats row */}
            {reactData.stats.sent_last_30_days > 0 && (
              <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '14px 18px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}` }}>
                <div>
                  <div style={{ fontSize: 11, color: S.textMuted, marginBottom: 2 }}>Sent (30d)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: S.accent }}>{reactData.stats.sent_last_30_days}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: S.textMuted, marginBottom: 2 }}>Converted</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: S.green }}>{reactData.stats.converted}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: S.textMuted, marginBottom: 2 }}>Declined Again</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: S.red }}>{reactData.stats.declined_again}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: S.textMuted, marginBottom: 2 }}>Conversion Rate</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: reactData.stats.conversion_rate >= 20 ? S.green : reactData.stats.conversion_rate >= 10 ? S.yellow : S.textSecondary }}>
                    {reactData.stats.conversion_rate}%
                  </div>
                </div>
                {Object.keys(reactData.stats.converted_by_reason).length > 0 && (
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: S.textSecondary }}>
                      Best: <strong style={{ color: S.green }}>
                        {getLossReasonLabel(Object.entries(reactData.stats.converted_by_reason).sort(([, a], [, b]) => b - a)[0][0])}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Due Now */}
            {reactData.due_now.count > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: S.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  DUE NOW — {reactData.due_now.count} prospect{reactData.due_now.count !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {reactData.due_now.cycles.map(c => (
                    <div key={c.id} style={{
                      background: S.bg, border: `1px solid ${S.border}`, borderRadius: S.radius, padding: 16,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: S.text }}>{c.prospect_name || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: S.textSecondary, marginTop: 2 }}>
                            {c.prospect_loss_reason && <span>{getLossReasonLabel(c.prospect_loss_reason)}</span>}
                            {c.days_overdue != null && <span style={{ marginLeft: 8, color: S.orange }}>{c.days_overdue}d overdue</span>}
                            {c.prospect_platform && <span style={{ marginLeft: 8, textTransform: 'capitalize' }}>{c.prospect_platform}</span>}
                            {(c.prospect_times_lost || 0) > 1 && <span style={{ marginLeft: 8, color: S.red }}>lost {c.prospect_times_lost}x</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: S.textMuted }}>
                          {c.reason_for_revisit === 'scheduled_auto' ? 'Auto' : c.reason_for_revisit}
                        </div>
                      </div>

                      {/* Message preview */}
                      {c.custom_message && (
                        <div style={{
                          background: S.surface, borderRadius: S.radiusSm, padding: '10px 14px',
                          fontSize: 12, color: S.text, lineHeight: 1.6, marginBottom: 12,
                          border: `1px solid ${S.borderLight}`, whiteSpace: 'pre-wrap',
                        }}>
                          {fillPlaceholders(c.custom_message, c.prospect_name || '')}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {c.custom_message && (
                          <button onClick={() => copyMessage(c.id, c.custom_message!, c.prospect_name || '')}
                            disabled={reactLoading === c.id}
                            style={{
                              padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: S.radiusSm,
                              border: `1px solid ${S.border}`, cursor: 'pointer',
                              background: copiedId === c.id ? S.greenLight : '#F3F4F6',
                              color: copiedId === c.id ? S.green : '#374151',
                            }}>
                            {copiedId === c.id ? 'Copied!' : 'Copy Message'}
                          </button>
                        )}
                        <button onClick={() => execCycle(c.id, 'send', { by: 'admin', note: '' })}
                          disabled={reactLoading === c.id}
                          style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: S.radiusSm,
                            border: 'none', cursor: 'pointer', background: S.accent, color: '#fff',
                          }}>
                          {reactLoading === c.id ? '...' : 'Mark as Sent'}
                        </button>
                        <button onClick={() => execCycle(c.id, 'skip', { by: 'admin' })}
                          disabled={reactLoading === c.id}
                          style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: S.radiusSm,
                            border: `1px solid ${S.border}`, cursor: 'pointer', background: '#F3F4F6', color: '#6B7280',
                          }}>
                          Skip
                        </button>
                        <button onClick={() => { setReactModal({ cycle: c }); setReactStage('contacted'); setReactNote(''); setReactBy('') }}
                          disabled={reactLoading === c.id}
                          style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: S.radiusSm,
                            border: 'none', cursor: 'pointer', background: S.green, color: '#fff',
                          }}>
                          Reactivate
                        </button>
                        <button onClick={() => { setDeclineModal({ cycle: c }); setDeclineSameReason(true); setDeclineReason(c.prospect_loss_reason || ''); setDeclineNote(''); setDeclineBy('') }}
                          disabled={reactLoading === c.id}
                          style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: S.radiusSm,
                            border: `1px solid ${S.border}`, cursor: 'pointer', background: S.redLight, color: S.red,
                          }}>
                          Declined Again
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming */}
            {reactData.upcoming.count > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: S.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  UPCOMING (next 14 days) — {reactData.upcoming.count} prospect{reactData.upcoming.count !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reactData.upcoming.cycles.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 14px', background: S.bg, borderRadius: S.radiusSm, border: `1px solid ${S.borderLight}`,
                    }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{c.prospect_name || 'Unknown'}</span>
                        {c.prospect_loss_reason && (
                          <span style={{ fontSize: 12, color: S.textSecondary, marginLeft: 10 }}>{getLossReasonLabel(c.prospect_loss_reason)}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: S.accent, fontWeight: 600 }}>
                        in {c.days_until || 0}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reactData.due_now.count === 0 && reactData.upcoming.count === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: S.textMuted, fontSize: 13 }}>
                No reactivations due. Cycles are auto-scheduled when prospects are marked as lost.
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Reactivate Modal ── */}
      {reactModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setReactModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 28, width: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: '0 0 4px' }}>
              Reactivate {reactModal.cycle.prospect_name}
            </h3>
            <p style={{ fontSize: 12, color: S.textSecondary, marginBottom: 16 }}>
              Lost {reactModal.cycle.days_overdue || 0} days ago
              {reactModal.cycle.prospect_loss_reason && <> — {getLossReasonLabel(reactModal.cycle.prospect_loss_reason)}</>}
              {(reactModal.cycle.prospect_times_lost || 0) > 1 && <span style={{ color: S.orange }}> · lost {reactModal.cycle.prospect_times_lost}x</span>}
            </p>

            <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>Put back in pipeline as</label>
            <select value={reactStage} onChange={e => setReactStage(e.target.value)}
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 14, background: S.bg }}>
              {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>

            <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>What changed? (optional)</label>
            <textarea value={reactNote} onChange={e => setReactNote(e.target.value)} rows={2}
              placeholder="e.g. We now have 50 LGs and proven earnings"
              style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 14, fontFamily: S.font, boxSizing: 'border-box', resize: 'vertical' }} />

            <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>Reactivated by</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {['safouane', 'joep'].map(s => (
                <button key={s} onClick={() => setReactBy(s)}
                  style={{
                    padding: '6px 16px', fontSize: 12, fontWeight: reactBy === s ? 600 : 400,
                    borderRadius: S.radiusSm, cursor: 'pointer', textTransform: 'capitalize',
                    border: `1px solid ${reactBy === s ? S.accent : S.border}`,
                    background: reactBy === s ? S.accentLight : S.bg,
                    color: reactBy === s ? S.accent : S.textSecondary,
                  }}>{s}</button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setReactModal(null)}
                style={{ padding: '8px 20px', fontSize: 13, borderRadius: S.radiusSm, border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                disabled={!reactBy}
                onClick={async () => {
                  setReactLoading(reactModal.cycle.id)
                  await fetch(`/api/admin/genx/reactivation/${reactModal.cycle.id}/execute`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reactivate', by: reactBy, new_stage: reactStage, reactivation_note: reactNote }),
                  })
                  setReactModal(null)
                  const res = await fetch('/api/admin/genx/reactivation')
                  setReactData(await res.json())
                  setReactLoading(null)
                  onRefresh()
                }}
                style={{
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: S.radiusSm,
                  border: 'none', cursor: reactBy ? 'pointer' : 'not-allowed',
                  background: reactBy ? S.green : S.border, color: reactBy ? '#fff' : S.textMuted,
                  opacity: reactBy ? 1 : 0.6,
                }}>
                Reactivate Prospect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Declined Again Modal ── */}
      {declineModal && (() => {
        const cycle = declineModal.cycle
        const timesLost = cycle.prospect_times_lost || 0
        const currentReason = cycle.prospect_loss_reason || ''
        const effectiveReason = declineSameReason ? currentReason : declineReason
        const canSubmit = effectiveReason && declineBy

        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }} onClick={() => setDeclineModal(null)}>
            <div style={{
              background: '#fff', borderRadius: 14, padding: 28, width: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: '0 0 4px' }}>
                {cycle.prospect_name} declined again
              </h3>
              <p style={{ fontSize: 12, color: S.textSecondary, marginBottom: 16 }}>
                This is attempt #{timesLost + 1}.
              </p>

              <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 8 }}>New reason</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: S.radiusSm, cursor: 'pointer',
                  border: `1px solid ${declineSameReason ? S.accent : S.borderLight}`,
                  background: declineSameReason ? S.accentLight : S.bg,
                }}>
                  <input type="radio" checked={declineSameReason} onChange={() => setDeclineSameReason(true)}
                    style={{ accentColor: S.accent }} />
                  <span style={{ fontSize: 13, color: S.text }}>Same reason ({getLossReasonLabel(currentReason)})</span>
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: S.radiusSm, cursor: 'pointer',
                  border: `1px solid ${!declineSameReason ? S.accent : S.borderLight}`,
                  background: !declineSameReason ? S.accentLight : S.bg,
                }}>
                  <input type="radio" checked={!declineSameReason} onChange={() => setDeclineSameReason(false)}
                    style={{ accentColor: S.accent }} />
                  <span style={{ fontSize: 13, color: S.text }}>Different reason:</span>
                  {!declineSameReason && (
                    <select value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '4px 8px', fontSize: 12, background: S.bg }}>
                      <option value="">Select...</option>
                      {['wants_fixed_fee', 'thinks_scam', 'thinks_mlm', 'no_time', 'no_reply_5plus', 'uses_competitor', 'too_complicated', 'bad_timing', 'other'].map(r => (
                        <option key={r} value={r}>{getLossReasonLabel(r)}</option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>Note (optional)</label>
              <textarea value={declineNote} onChange={e => setDeclineNote(e.target.value)} rows={2}
                placeholder="Extra context..."
                style={{ width: '100%', border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '8px 12px', fontSize: 13, marginBottom: 10, fontFamily: S.font, boxSizing: 'border-box', resize: 'vertical' }} />

              {/* Escalation info */}
              <div style={{
                background: timesLost + 1 >= 3 ? S.redLight : S.yellowLight,
                borderRadius: S.radiusSm, padding: '8px 12px', marginBottom: 14,
                fontSize: 12, color: timesLost + 1 >= 3 ? S.red : S.yellow, fontWeight: 500,
              }}>
                {timesLost + 1 >= 3
                  ? 'After 3 declines, no more reactivation will be scheduled. This prospect is permanently lost.'
                  : `Next reactivation will be scheduled with ${Math.min(timesLost + 1, 3)}x the standard wait time.`}
              </div>

              <label style={{ fontSize: 12, fontWeight: 500, color: S.textSecondary, display: 'block', marginBottom: 4 }}>Marked by</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {['safouane', 'joep'].map(s => (
                  <button key={s} onClick={() => setDeclineBy(s)}
                    style={{
                      padding: '6px 16px', fontSize: 12, fontWeight: declineBy === s ? 600 : 400,
                      borderRadius: S.radiusSm, cursor: 'pointer', textTransform: 'capitalize',
                      border: `1px solid ${declineBy === s ? S.accent : S.border}`,
                      background: declineBy === s ? S.accentLight : S.bg,
                      color: declineBy === s ? S.accent : S.textSecondary,
                    }}>{s}</button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setDeclineModal(null)}
                  style={{ padding: '8px 20px', fontSize: 13, borderRadius: S.radiusSm, border: `1px solid ${S.border}`, background: S.bg, color: S.textSecondary, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  disabled={!canSubmit}
                  onClick={async () => {
                    setReactLoading(cycle.id)
                    await fetch(`/api/admin/genx/reactivation/${cycle.id}/execute`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'declined_again', by: declineBy, new_loss_reason: effectiveReason, note: declineNote }),
                    })
                    setDeclineModal(null)
                    const res = await fetch('/api/admin/genx/reactivation')
                    setReactData(await res.json())
                    setReactLoading(null)
                  }}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: S.radiusSm,
                    border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                    background: canSubmit ? S.red : S.border, color: canSubmit ? '#fff' : S.textMuted,
                    opacity: canSubmit ? 1 : 0.6,
                  }}>
                  Mark as Declined
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Today's Activity + Pending Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
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

        <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Pending Actions</h3>
          {lgs.filter(l => l.status === 'pending').map(lg => (
            <div key={lg.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: S.yellowLight, borderRadius: S.radiusSm, marginBottom: 8, border: '1px solid #FDE68A' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{lg.display_name}</div>
                <div style={{ fontSize: 11, color: S.textSecondary }}>Wacht op goedkeuring</div>
              </div>
              <button onClick={() => action(lg.id, 'approve')} disabled={loading === lg.id + 'approve'}
                style={{ background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {loading === lg.id + 'approve' ? '...' : 'Approve'}
              </button>
            </div>
          ))}
          {pendingPayouts.map(p => {
            const lg = lgs.find(l => l.id === p.lg_id)
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: S.greenLight, borderRadius: S.radiusSm, marginBottom: 8, border: '1px solid #A7F3D0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{lg?.display_name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: S.textSecondary }}>${parseFloat(String(p.amount)).toFixed(2)} — {p.period_start}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input placeholder="Ref" value={payRef[p.id] || ''} onChange={e => setPayRef(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ border: `1px solid ${S.border}`, borderRadius: S.radiusSm, padding: '4px 8px', fontSize: 11, width: 100 }} />
                  <button onClick={() => markPaid(p.id)} disabled={loading === p.id}
                    style={{ background: S.green, color: '#fff', border: 'none', borderRadius: S.radiusSm, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
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

      {/* ── Recent Activity Feed ── */}
      <div style={{ background: S.surface, borderRadius: S.radius, padding: 20, border: `1px solid ${S.border}` }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: S.text }}>Recent Activity</h3>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {recentActivities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: S.textMuted, fontSize: 13 }}>No recent activity</div>
          ) : recentActivities.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${S.borderLight}` }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                background: a.direction === 'inbound' ? S.orange :
                  a.activity_type === 'status_change' ? S.accent :
                  a.activity_type === 'call' ? S.green :
                  a.activity_type === 'dm' ? S.purple : S.textMuted,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: S.text }}>
                  {a.direction === 'inbound' && <span style={{ color: S.orange, fontWeight: 600, marginRight: 4 }}>← IN</span>}
                  {a.direction === 'outbound' && <span style={{ color: S.accent, fontWeight: 600, marginRight: 4 }}>→ OUT</span>}
                  <strong>{a.admin_prospects?.name || 'Prospect'}</strong>{' — '}
                  {a.description || a.activity_type}
                  {a.response_time_minutes != null && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, fontWeight: 600,
                      color: a.response_time_minutes <= 5 ? S.green : a.response_time_minutes <= 60 ? S.yellow : S.red,
                    }}>
                      ⏱ {a.response_time_minutes < 60 ? `${a.response_time_minutes}m` : `${(a.response_time_minutes / 60).toFixed(1)}h`}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2 }}>
                  {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {a.sender && <span style={{ marginLeft: 6 }}>· {a.sender}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
