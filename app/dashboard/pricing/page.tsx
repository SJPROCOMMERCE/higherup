'use client'

import { useState, useEffect } from 'react'
import { useVA } from '@/context/va-context'
import { supabase } from '@/lib/supabase'
import { getTiers, getTierSync, formatTierRange, DEFAULT_TIERS, type Tier } from '@/lib/pricing'
import type { Client } from '@/lib/supabase'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  gray:   '#86868B',
  ghost:  '#CCCCCC',
  light:  '#F5F5F7',
  border: '#EEEEEE',
  white:  '#FFFFFF',
  green:  '#10B981',
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'What counts as a product?',
    a: 'Every row in your CSV or spreadsheet is counted as a product row. If a product has 5 sizes and 3 colors, that\'s 15 rows. The header row and image-only rows don\'t count.',
  },
  {
    q: 'When does my count reset?',
    a: 'On the 1st of every month. Your product count starts at zero.',
  },
  {
    q: 'What if I go over a tier mid-month?',
    a: 'You\'re billed based on the total at the end of the month. If you start at Starter tier but process more than 200 products, you\'ll move to Growth tier for that client.',
  },
  {
    q: 'Can different clients be on different tiers?',
    a: 'Yes. Each client has their own tier based on their own product count. One client on Starter and another on Professional is normal.',
  },
  {
    q: 'When do I pay?',
    a: 'Invoices are generated on the 1st of the month. Payment is due within 48 hours.',
  },
  {
    q: 'What happens if I don\'t pay?',
    a: 'Your account is paused after 48 hours. After 14 days of non-payment, your account is deleted.',
  },
]

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: '#F0F0F0', marginBlock: 32 }} />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { currentVA } = useVA()
  const [tiers, setTiers]             = useState<Tier[]>(DEFAULT_TIERS)
  const [clients, setClients]         = useState<Client[]>([])
  const [loading, setLoading]         = useState(true)
  const [calcClients, setCalcClients] = useState<number | string>(3)
  const [calcVariants, setCalcVariants] = useState<number | string>(250)
  const [openFaq, setOpenFaq]         = useState<number | null>(null)

  useEffect(() => {
    getTiers().then(setTiers)
  }, [])

  useEffect(() => {
    if (!currentVA?.id) return
    supabase
      .from('clients')
      .select('id, store_name, current_month_variants, is_active, approval_status')
      .eq('va_id', currentVA.id)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .then(({ data }) => {
        setClients((data ?? []) as Client[])
        setLoading(false)
      })
  }, [currentVA?.id])

  // Determine current tier from highest-variant client
  const maxVariants  = clients.reduce((max, c) => Math.max(max, c.current_month_variants ?? 0), 0)
  const currentTier  = getTierSync(tiers, maxVariants)

  return (
    <div style={{
      maxWidth: 900,
      margin: '0 auto',
      paddingInline: 48,
      paddingBottom: 80,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', paddingTop: 56, paddingBottom: 48 }}>
        <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, margin: 0, letterSpacing: '-0.02em' }}>
          Pricing
        </h1>
        <p style={{ fontSize: 13, color: T.ghost, marginTop: 8, marginBottom: 4 }}>
          Simple pricing based on how many products you process.
        </p>
        <p style={{ fontSize: 13, color: T.black, marginTop: 0 }}>
          No signup fees. No deposits. Pay at the end of each month.
        </p>
      </div>

      {/* ── Tier cards ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 8,
      }}>
        {tiers.map(tier => {
          const isCurrentTier = tier.tier_name === currentTier.tier_name
          return (
            <div
              key={tier.id}
              style={{
                border: `1px solid ${isCurrentTier ? T.black : T.border}`,
                borderRadius: 12,
                padding: 24,
                position: 'relative',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { if (!isCurrentTier) e.currentTarget.style.borderColor = T.ghost }}
              onMouseLeave={e => { if (!isCurrentTier) e.currentTarget.style.borderColor = T.border }}
            >
              {isCurrentTier && (
                <div style={{ fontSize: 10, fontWeight: 500, color: T.black, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Your current tier
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 12 }}>{tier.display_name}</div>
              <div style={{ fontSize: 36, fontWeight: 600, color: T.black, marginBottom: 2 }}>${tier.amount}</div>
              <div style={{ fontSize: 12, color: T.ghost, marginBottom: 16 }}>/month per client</div>
              <div style={{ height: 1, background: '#F0F0F0', marginBottom: 16 }} />
              <div style={{ fontSize: 13, color: T.gray, marginBottom: 8 }}>{formatTierRange(tier)} products / month</div>
              {tier.description && (
                <div style={{ fontSize: 12, color: T.ghost, lineHeight: 1.5 }}>{tier.description}</div>
              )}
            </div>
          )
        })}
      </div>

      <Divider />

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
          HOW IT WORKS
        </div>
        {[
          'Each client you serve has their own tier based on how many products you process for them per month.',
          'Product count is the total number of rows processed across all uploads for that client in a month.',
          'If a client has 3 uploads of 100 products each, that\'s 300 products = Growth tier ($110).',
          'Your monthly invoice is the sum of all your client tiers.',
        ].map((step, i) => (
          <div key={i} style={{ fontSize: 13, color: T.gray, marginBottom: 12, display: 'flex', gap: 16 }}>
            <span style={{ color: T.ghost, flexShrink: 0 }}>{i + 1}.</span>
            <span>{step}</span>
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Your current month ─────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
          YOUR CURRENT MONTH
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: T.ghost }}>Loading…</div>
        ) : clients.length === 0 ? (
          <div style={{ fontSize: 13, color: T.ghost }}>No active clients yet.</div>
        ) : (
          <>
            {clients.map(c => {
              const variants = c.current_month_variants ?? 0
              const tier     = getTierSync(tiers, variants)
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', paddingBlock: 10, borderBottom: '1px solid #F5F5F5' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{c.store_name}</div>
                    <div style={{ fontSize: 13, color: T.gray, marginTop: 2 }}>{variants.toLocaleString()} products this month</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: T.black }}>→ {tier.display_name} · ${tier.amount}</div>
                  </div>
                </div>
              )
            })}

            <div style={{ paddingTop: 20, borderTop: '1px solid #F0F0F0', marginTop: 8 }}>
              {(() => {
                const total = clients.reduce((s, c) => s + getTierSync(tiers, c.current_month_variants ?? 0).amount, 0)
                return (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 600, color: T.black }}>Total estimated invoice: ${total}</div>
                    <div style={{ fontSize: 12, color: T.ghost, marginTop: 4 }}>
                      Based on {clients.length} active client{clients.length !== 1 ? 's' : ''}
                    </div>
                  </>
                )
              })()}
            </div>
          </>
        )}
      </div>

      <Divider />

      {/* ── Calculator ─────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
          ESTIMATE YOUR COSTS
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.black, flexWrap: 'wrap', marginBottom: 24 }}>
          <span>If you have</span>
          <input
            type="text"
            inputMode="numeric"
            value={calcClients}
            onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setCalcClients(v) }}
            style={{ width: 60, fontSize: 13, textAlign: 'center', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 8px', outline: 'none' }}
          />
          <span>clients averaging</span>
          <input
            type="text"
            inputMode="numeric"
            value={calcVariants}
            onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setCalcVariants(v) }}
            style={{ width: 80, fontSize: 13, textAlign: 'center', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 8px', outline: 'none' }}
          />
          <span>products each</span>
        </div>

        {(() => {
          const clientCount  = typeof calcClients  === 'string' ? (parseInt(calcClients)  || 0) : calcClients
          const productCount = typeof calcVariants === 'string' ? (parseInt(calcVariants) || 0) : calcVariants
          const tier  = getTierSync(tiers, productCount)
          const total = tier.amount * clientCount
          return (
            <>
              <div style={{ fontSize: 18, fontWeight: 500, color: T.black, marginBottom: 12 }}>
                Your estimated HigherUp share: ${total.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: T.gray }}>
                {clientCount} client{clientCount !== 1 ? 's' : ''} × {tier.display_name} (${tier.amount}) = ${total.toLocaleString()}
              </div>
            </>
          )
        })()}
      </div>

      <Divider />

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
          COMMON QUESTIONS
        </div>
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: T.black }}>{item.q}</span>
              <span style={{
                fontSize: 12,
                color: T.ghost,
                transform: openFaq === i ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
                flexShrink: 0,
              }}>▼</span>
            </button>
            {openFaq === i && (
              <div style={{ fontSize: 13, color: T.gray, lineHeight: 1.6, paddingBottom: 16 }}>{item.a}</div>
            )}
          </div>
        ))}
      </div>

    </div>
  )
}
