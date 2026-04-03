'use client'

import { useState } from 'react'

type Funnel = { clicks: number; signups: number; first_uploads: number; active: number }
type Last7  = { clicks: number; signups: number }

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 8 },
  mono:  { fontFamily: "'JetBrains Mono', monospace" },
  card:  { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
}

function pct(a: number, b: number) {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

export default function RecruitClient({ referralCode, referralLink, funnel, last7 }: {
  referralCode: string; referralLink: string; funnel: Funnel; last7: Last7
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const max7 = Math.max(last7.clicks, last7.signups, 1)

  // Lifetime value calculation: assume VA averages 200 products/month
  const avgMonthly     = 200
  const lgSharePerProd = 0.05
  const monthlyShare   = Math.max(0, avgMonthly - 10) * lgSharePerProd
  const yearlyShare    = monthlyShare * 12
  const foreverShare   = yearlyShare * 3 // ~3 year avg

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#FFFFFF', margin: '0 0 32px' }}>Recruit</h1>

      {/* Referral link */}
      <div style={{ ...S.card, marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ ...S.mono, color: '#FFFFFF', fontSize: 13, wordBreak: 'break-all' }}>{referralLink}</span>
        <button onClick={handleCopy} style={{
          background: '#FFFFFF', color: '#0A0A0A', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          letterSpacing: '0.04em',
        }}>
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      {/* Funnel */}
      <div style={{ ...S.card, marginBottom: 32 }}>
        <span style={S.label}>Funnel</span>
        {[
          { label: 'Clicks',       value: funnel.clicks,       pctOf: null },
          { label: 'Sign-ups',     value: funnel.signups,      pctOf: funnel.clicks },
          { label: 'First upload', value: funnel.first_uploads,pctOf: funnel.signups },
          { label: 'Active (50+)', value: funnel.active,       pctOf: funnel.first_uploads },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid #1F1F1F' : 'none' }}>
            <span style={{ fontSize: 13, color: '#888888' }}>{row.label}</span>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              {row.pctOf !== null && (
                <span style={{ ...S.mono, fontSize: 12, color: '#555555' }}>{pct(row.value, row.pctOf)} conversion</span>
              )}
              <span style={{ ...S.mono, fontSize: 15, color: '#FFFFFF', minWidth: 40, textAlign: 'right' }}>{row.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Last 7 days */}
      <div style={{ ...S.card, marginBottom: 32 }}>
        <span style={S.label}>Last 7 Days</span>
        {[
          { label: 'Clicks',   value: last7.clicks },
          { label: 'Sign-ups', value: last7.signups },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: '#888888', minWidth: 80 }}>{row.label}</span>
            <div style={{ flex: 1, height: 6, background: '#1F1F1F', borderRadius: 3 }}>
              <div style={{ height: 6, background: '#FFFFFF', borderRadius: 3, width: `${(row.value / max7) * 100}%`, minWidth: row.value > 0 ? 4 : 0 }} />
            </div>
            <span style={{ ...S.mono, fontSize: 13, color: '#FFFFFF', minWidth: 28, textAlign: 'right' }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* What one referral is worth */}
      <div style={S.card}>
        <span style={S.label}>What One Referral Is Worth</span>
        <div style={{ fontSize: 13, color: '#888888', lineHeight: 1.7 }}>
          A VA averaging {avgMonthly} products/month generates{' '}
          <span style={{ ...S.mono, color: '#FFFFFF', fontWeight: 700 }}>${monthlyShare.toFixed(2)}/month</span> for you.
          That&apos;s{' '}
          <span style={{ ...S.mono, color: '#FFFFFF', fontWeight: 700 }}>${yearlyShare.toFixed(0)}/year</span>.
          Over a typical career:{' '}
          <span style={{ ...S.mono, color: '#22C55E', fontWeight: 700 }}>${foreverShare.toFixed(0)}</span> per VA.
          Forever. No cap.
        </div>
        <div style={{ marginTop: 16, ...S.mono, fontSize: 12, color: '#555555' }}>
          Code: {referralCode}
        </div>
      </div>
    </div>
  )
}
