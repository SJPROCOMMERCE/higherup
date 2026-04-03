'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Meta ─────────────────────────────────────────────────────────────────────
// export const metadata = { ... }  — set in layout or via generateMetadata

// ─── Constants ────────────────────────────────────────────────────────────────
const PRICE_PER_PRODUCT   = 0.25
const FREE_PER_MONTH      = 10
const DEFAULT_PRODUCTS    = 200
const DEFAULT_RATE        = 0.65

const T = {
  black:  '#111111',
  muted:  '#666666',
  ghost:  '#999999',
  border: '#EEEEEE',
  green:  '#2DB87E',
  bg:     '#FAFAFA',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcShare(products: number): number {
  return Math.round(Math.max(0, products - FREE_PER_MONTH) * PRICE_PER_PRODUCT * 100) / 100
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals)
}

function fmtInt(n: number): string {
  return n.toLocaleString()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ padding: '80px 24px', ...style }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {children}
      </div>
    </section>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
      letterSpacing: '0.12em', color: T.ghost, margin: '0 0 16px',
    }}>
      {children}
    </p>
  )
}

function CTAButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '14px 32px', borderRadius: 100,
        background: T.black, color: '#FFFFFF',
        fontSize: 15, fontWeight: 500, textDecoration: 'none',
        transition: 'background 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#333333'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.background = T.black; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {children}
    </Link>
  )
}

// ─── Section 1: Hero Calculator ───────────────────────────────────────────────

function CalcInput({
  label, value, onChange, prefix, suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: T.muted, display: 'block', marginBottom: 8 }}>
        {label}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: `1.5px solid ${focused ? T.black : T.border}`,
        borderRadius: 10, padding: '10px 14px', background: '#FFFFFF',
        transition: 'border-color 0.15s',
      }}>
        {prefix && <span style={{ fontSize: 16, color: T.muted, fontWeight: 500, lineHeight: 1 }}>{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => {
            const v = e.target.value
            if (v === '' || /^\d*\.?\d*$/.test(v)) onChange(v)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1, fontSize: 18, fontWeight: 600, color: T.black,
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'inherit', minWidth: 0,
          }}
        />
        {suffix && <span style={{ fontSize: 13, color: T.ghost, fontWeight: 400, whiteSpace: 'nowrap' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function HeroCalculator() {
  const [products, setProducts] = useState(String(DEFAULT_PRODUCTS))
  const [rate,     setRate]     = useState(String(DEFAULT_RATE))

  const numProducts = parseFloat(products) || 0
  const numRate     = parseFloat(rate)     || 0

  const earnings  = Math.round(numProducts * numRate * 100) / 100
  const share     = calcShare(numProducts)
  const profit    = Math.round((earnings - share) * 100) / 100
  const keepPct   = earnings > 0 ? Math.round((profit / earnings) * 100) : 0

  const isAllFree = numProducts <= FREE_PER_MONTH && numProducts > 0

  return (
    <div style={{
      background: T.bg, borderRadius: 20, padding: '40px 40px',
      maxWidth: 560, width: '100%',
    }}>
      {/* Inputs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <CalcInput
          label="Products per month"
          value={products}
          onChange={setProducts}
          suffix="products"
        />
        <CalcInput
          label="Your rate per product"
          value={rate}
          onChange={setRate}
          prefix="$"
        />
      </div>

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 14, color: T.muted }}>Your earnings</span>
          <span style={{ fontSize: 16, fontWeight: 500, color: T.black }}>${fmt(earnings)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 14, color: T.muted }}>HigherUp share (platform)</span>
          <span style={{ fontSize: 16, color: T.muted }}>
            {isAllFree ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: T.ghost, textDecoration: 'line-through' }}>${fmt(share)}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, background: `${T.green}18`,
                  color: T.green, borderRadius: 20, padding: '2px 8px',
                }}>FREE</span>
              </span>
            ) : (
              `$${fmt(share)}`
            )}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: `1.5px solid ${T.border}` }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.black }}>Your monthly profit</span>
          <span style={{ fontSize: 36, fontWeight: 700, color: T.green, letterSpacing: '-0.03em', lineHeight: 1 }}>
            ${fmt(profit)}
          </span>
        </div>
      </div>

      {/* Percentage + free note */}
      {earnings > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 13, color: T.green, fontWeight: 500, margin: 0 }}>
            You keep {keepPct}% of everything you earn.
          </p>
          {!isAllFree && (
            <p style={{ fontSize: 12, color: T.ghost, margin: 0 }}>
              ✓ First {FREE_PER_MONTH} products every month are free
            </p>
          )}
        </div>
      )}
      {isAllFree && (
        <p style={{ fontSize: 12, color: T.green, fontWeight: 500, margin: '8px 0 0' }}>
          ✓ Under {FREE_PER_MONTH} products this month — completely free
        </p>
      )}
    </div>
  )
}

// ─── Section 2: Profit Scale Table ────────────────────────────────────────────

const SCALE_ROWS = [10, 50, 100, 200, 500, 1000]
const RATE = 0.65

function ProfitScaleTable() {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -4px' }}>
      <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {['Products/mo', 'You earn¹', 'HigherUp share', 'Your profit'].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: '8px 12px',
                  fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: T.ghost,
                  borderBottom: `1.5px solid ${T.border}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCALE_ROWS.map(p => {
            const earn   = Math.round(p * RATE * 100) / 100
            const share  = calcShare(p)
            const profit = Math.round((earn - share) * 100) / 100
            const isFree = p <= FREE_PER_MONTH

            return (
              <tr key={p} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '14px 12px', color: T.black, fontWeight: 500 }}>
                  {fmtInt(p)}/mo
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right', color: T.black }}>
                  ${fmt(earn)}
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                  {isFree ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: T.ghost }}>$0.00</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, background: `${T.green}18`,
                        color: T.green, borderRadius: 20, padding: '2px 8px',
                      }}>FREE</span>
                    </span>
                  ) : (
                    <span style={{ color: T.muted }}>${fmt(share)}</span>
                  )}
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right', color: T.green, fontWeight: 600 }}>
                  ${fmt(profit)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: T.ghost, marginTop: 14, lineHeight: 1.6 }}>
        ¹ Based on ${RATE}/product — the market average for AI-assisted listing. You set your own rate.
      </p>
      <p style={{ fontSize: 13, color: T.muted, marginTop: 6, fontWeight: 500 }}>
        Your profit margin stays above 60% at any volume.
      </p>
    </div>
  )
}

// ─── Section 3: How It Works ──────────────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    title: 'Upload',
    body: "Export your client's CSV from Shopify. Upload it to HigherUp in seconds.",
  },
  {
    num: '02',
    title: 'AI optimizes',
    body: 'Titles, descriptions, tags, SEO, SKUs — all rewritten and optimized in seconds.',
  },
  {
    num: '03',
    title: 'Download & deliver',
    body: 'Import the CSV back to Shopify. Your client sees professional results. Done.',
  },
]

// ─── Section 4: Features ──────────────────────────────────────────────────────

const FEATURES = [
  'AI-optimized titles (keyword-rich, Google Shopping ready)',
  'Professional product descriptions',
  'Auto-generated tags',
  'SEO titles & meta descriptions',
  'Smart SKU builder',
  'Multi-language support (English, Polish, and more)',
  'CSV upload & download — works with Shopify export',
  `${FREE_PER_MONTH} free products every month`,
  'Support chat with the HigherUp team',
  'No contracts. No minimums. Cancel anytime.',
]

// ─── Section 5: Comparison ────────────────────────────────────────────────────

const COMPARISON = [
  { label: 'Time per product',    manual: '15–20 min',    higherup: '< 1 min'       },
  { label: '200 products',        manual: '50+ hours',    higherup: '~30 minutes'   },
  { label: 'Quality',             manual: 'Inconsistent', higherup: 'AI-consistent' },
  { label: 'SEO optimization',    manual: 'Manual',       higherup: 'Automatic'     },
  { label: 'SKU generation',      manual: 'Manual',       higherup: 'Automatic'     },
  { label: 'Your time investment', manual: '50+ hours',   higherup: '~30 minutes'   },
  { label: 'Cost to you',         manual: 'Your time',    higherup: '$47.50/mo'     },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfitPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFFFFF', color: T.black }}>

      {/* ── SECTION 1: Hero ──────────────────────────────────────────────────── */}
      <Section style={{ paddingTop: 96, paddingBottom: 80 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 56 }}>
          <h1 style={{ fontSize: 48, fontWeight: 700, color: T.black, letterSpacing: '-0.04em', margin: '0 0 16px', lineHeight: 1.1 }}>
            See your profit.
          </h1>
          <p style={{ fontSize: 18, color: T.muted, margin: 0, maxWidth: 480, lineHeight: 1.6 }}>
            List products with AI. Keep most of what you earn.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <HeroCalculator />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
          <CTAButton href="/dashboard">Start listing →</CTAButton>
        </div>
      </Section>

      {/* Divider */}
      <div style={{ maxWidth: 880, margin: '0 auto', height: 1, background: T.border }} />

      {/* ── SECTION 2: Profit Scale ───────────────────────────────────────────── */}
      <Section>
        <SectionLabel>The numbers</SectionLabel>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.black, margin: '0 0 32px', letterSpacing: '-0.03em' }}>
          The more you list, the more you keep.
        </h2>
        <ProfitScaleTable />
      </Section>

      {/* Divider */}
      <div style={{ maxWidth: 880, margin: '0 auto', height: 1, background: T.border }} />

      {/* ── SECTION 3: How It Works ───────────────────────────────────────────── */}
      <Section>
        <SectionLabel>How it works</SectionLabel>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.black, margin: '0 0 48px', letterSpacing: '-0.03em' }}>
          Three steps. Minutes, not hours.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 48 }}>
          {STEPS.map(step => (
            <div key={step.num}>
              <div style={{ fontSize: 32, fontWeight: 700, color: T.green, marginBottom: 12, lineHeight: 1 }}>
                {step.num}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: T.black, margin: '0 0 10px' }}>
                {step.title}
              </h3>
              <p style={{ fontSize: 14, color: T.muted, margin: 0, lineHeight: 1.7 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, padding: '20px 24px', background: T.bg, borderRadius: 12 }}>
          <p style={{ fontSize: 15, color: T.black, margin: 0, lineHeight: 1.7 }}>
            Your client sees professional results.{' '}
            <span style={{ color: T.muted }}>You did it in minutes, not hours.</span>
          </p>
        </div>
      </Section>

      {/* Divider */}
      <div style={{ maxWidth: 880, margin: '0 auto', height: 1, background: T.border }} />

      {/* ── SECTION 4: Features ───────────────────────────────────────────────── */}
      <Section>
        <SectionLabel>What&apos;s included</SectionLabel>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.black, margin: '0 0 40px', letterSpacing: '-0.03em' }}>
          Everything included. No upsells.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px 64px', marginBottom: 36 }}>
          {FEATURES.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ color: T.green, fontWeight: 700, fontSize: 15, lineHeight: '22px', flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>{f}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: T.black, margin: 0 }}>
            ${PRICE_PER_PRODUCT} per product. That&apos;s it.
          </p>
        </div>
      </Section>

      {/* Divider */}
      <div style={{ maxWidth: 880, margin: '0 auto', height: 1, background: T.border }} />

      {/* ── SECTION 5: Comparison ─────────────────────────────────────────────── */}
      <Section>
        <SectionLabel>The alternative</SectionLabel>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.black, margin: '0 0 32px', letterSpacing: '-0.03em' }}>
          HigherUp vs. doing it yourself
        </h2>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, borderBottom: `1.5px solid ${T.border}` }}></th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.ghost, borderBottom: `1.5px solid ${T.border}` }}>Manual</th>
                <th style={{ textAlign: 'right', padding: '10px 16px 10px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.green, borderBottom: `1.5px solid ${T.border}`, borderRadius: '8px 8px 0 0', background: `${T.green}08` }}>With HigherUp</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={row.label} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '14px 12px', color: T.muted, fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', color: T.ghost }}>{row.manual}</td>
                  <td style={{ padding: '14px 16px 14px 12px', textAlign: 'right', color: T.black, fontWeight: 500, background: `${T.green}08` }}>
                    {row.higherup}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 28, padding: '20px 24px', background: T.bg, borderRadius: 12 }}>
          <p style={{ fontSize: 14, color: T.black, fontWeight: 600, margin: '0 0 6px' }}>
            If your time is worth $5/hour, listing 200 products manually costs $250 in time.
          </p>
          <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>
            HigherUp does it for $47.50. You save $200+.
          </p>
        </div>
      </Section>

      {/* Divider */}
      <div style={{ maxWidth: 880, margin: '0 auto', height: 1, background: T.border }} />

      {/* ── SECTION 6: CTA ────────────────────────────────────────────────────── */}
      <Section style={{ paddingTop: 96, paddingBottom: 96 }}>
        <div style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: T.black, letterSpacing: '-0.04em', margin: '0 0 12px', lineHeight: 1.2 }}>
            Start with {FREE_PER_MONTH} free products.
          </h2>
          <p style={{ fontSize: 15, color: T.muted, margin: '0 0 36px', lineHeight: 1.6 }}>
            No credit card. No commitment.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <CTAButton href="/dashboard">Start listing →</CTAButton>
          </div>
          <p style={{ fontSize: 13, color: T.ghost, margin: 0 }}>
            Join VAs already listing with HigherUp.
          </p>
        </div>
      </Section>

    </div>
  )
}
