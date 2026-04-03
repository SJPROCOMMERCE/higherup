'use client'

import { useState } from 'react'
import { PageVideo } from '@/components/dashboard/PageVideo'
import { FREE_PRODUCTS_PER_MONTH, PRICE_PER_PRODUCT } from '@/lib/usage-tracker'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  sec:    '#999999',
  ghost:  '#CCCCCC',
  div:    '#F5F5F5',
  border: '#EEEEEE',
  green:  '#2DB87E',
}

const label9: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: T.ghost,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtD(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcShare(totalProducts: number): number {
  const billable = Math.max(0, totalProducts - FREE_PRODUCTS_PER_MONTH)
  return Math.round(billable * PRICE_PER_PRODUCT * 100) / 100
}

// ─── Input ────────────────────────────────────────────────────────────────────

function Inp({
  label, prefix, value, onChange, decimal = false,
}: {
  label: string
  prefix?: string
  value: string
  onChange: (v: string) => void
  decimal?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const pattern = decimal ? /^\d*\.?\d*$/ : /^\d*$/
  return (
    <div>
      <p style={label9}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 8 }}>
        {prefix && (
          <span style={{ fontSize: 32, fontWeight: 600, color: T.ghost, lineHeight: 1 }}>{prefix}</span>
        )}
        <input
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          onChange={e => {
            const v = e.target.value
            if (v === '' || pattern.test(v)) onChange(v)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            fontSize: 32,
            fontWeight: 600,
            color: T.black,
            borderBottom: `1.5px solid ${focused ? T.black : T.border}`,
            outline: 'none',
            background: 'transparent',
            paddingBottom: 6,
            fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
        />
      </div>
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ label, value, color = T.sec, weight = 400, borderTop = true }: {
  label: string; value: string; color?: string; weight?: number; borderTop?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderTop: borderTop ? `1px solid ${T.div}` : undefined,
    }}>
      <span style={{ fontSize: 14, color, fontWeight: weight }}>{label}</span>
      <span style={{ fontSize: 14, color, fontWeight: weight }}>{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfitPage() {
  const [clients,           setClients]           = useState('5')
  const [productsPerClient, setProductsPerClient] = useState('100')
  const [ratePerProduct,    setRatePerProduct]     = useState('0.65')

  const numClients  = Math.max(0, parseInt(clients,  10) || 0)
  const numProducts = Math.max(0, parseInt(productsPerClient, 10) || 0)
  const numRate     = parseFloat(ratePerProduct) || 0

  const totalProducts    = numClients * numProducts
  const freeProducts     = Math.min(FREE_PRODUCTS_PER_MONTH, totalProducts)
  const billableProducts = Math.max(0, totalProducts - FREE_PRODUCTS_PER_MONTH)
  const higherUpShare    = calcShare(totalProducts)

  const youEarn   = totalProducts * numRate
  const profit    = youEarn - higherUpShare
  const profitPct = youEarn > 0 ? Math.round((profit / youEarn) * 100) : 0

  // Context stats
  const hoursPerMonth = numClients * 2
  const hourlyRate    = hoursPerMonth > 0 ? profit / hoursPerMonth : 0

  // Per-client view
  const sharePerClient  = numClients > 0 ? higherUpShare / numClients : 0
  const earnPerClient   = numProducts * numRate
  const profitPerClient = earnPerClient - sharePerClient

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px' }}>

      {/* Header */}
      <h1 style={{ fontSize: 28, fontWeight: 300, color: T.black, margin: 0 }}>Your profit</h1>
      <p style={{ marginTop: 8, fontSize: 14, color: T.ghost }}>See exactly what you take home.</p>

      <PageVideo slug="profit" />

      {/* Free allowance badge */}
      <div style={{
        marginTop: 32,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#F0FFF8', border: '1px solid #BBF7D0',
        borderRadius: 10, padding: '8px 16px',
      }}>
        <span style={{ fontSize: 16 }}>🎁</span>
        <span style={{ fontSize: 13, color: '#166534' }}>
          First {FREE_PRODUCTS_PER_MONTH} products every month are on us — completely free.
        </span>
      </div>

      {/* Inputs */}
      <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32 }}>
        <Inp label="CLIENTS"             value={clients}           onChange={setClients} />
        <Inp label="PRODUCTS PER CLIENT" value={productsPerClient} onChange={setProductsPerClient} />
        <div>
          <Inp label="YOUR RATE / PRODUCT" value={ratePerProduct} onChange={setRatePerProduct} prefix="$" decimal />
          {numRate > 0 && numRate < 0.50 && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFFBEB', borderRadius: 8 }}>
              <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>
                We recommend at least $0.50 per product.
              </p>
              <p style={{ fontSize: 12, color: '#B45309', margin: '4px 0 0' }}>
                Most successful operators charge between $0.65 and $1.20.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* You earn */}
      <div style={{ marginTop: 64, textAlign: 'center' }}>
        <p style={label9}>YOU EARN</p>
        <p style={{ marginTop: 8, fontSize: 64, fontWeight: 600, color: T.green, lineHeight: 1 }}>
          ${fmt(youEarn)}
        </p>
        <p style={{ marginTop: 8, fontSize: 14, color: T.ghost }}>
          {numClients} client{numClients !== 1 ? 's' : ''} × {numProducts} products × ${numRate}
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 48, maxWidth: 400, margin: '48px auto 0' }}>
        <div style={{ height: 10, borderRadius: 99, background: T.border, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: T.green,
            width: `${Math.max(0, Math.min(100, profitPct))}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: T.green }}>${fmtD(profit)} yours</p>
            <p style={{ fontSize: 11, color: T.ghost }}>{profitPct}%</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, color: T.ghost }}>${fmtD(higherUpShare)} HigherUp</p>
            <p style={{ fontSize: 11, color: '#DDDDDD' }}>{100 - profitPct}%</p>
          </div>
        </div>
      </div>

      {/* Monthly profit */}
      <div style={{ marginTop: 64, textAlign: 'center' }}>
        <p style={label9}>YOUR MONTHLY PROFIT</p>
        <p style={{ marginTop: 8, fontSize: 72, fontWeight: 600, color: T.black, lineHeight: 1 }}>
          ${fmtD(profit)}
        </p>
      </div>

      {/* Context stats */}
      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'center', gap: 64 }}>
        {[
          { value: `$${fmtD(hourlyRate)}`, label: '/HOUR'  },
          { value: `${hoursPerMonth}h`,     label: '/MONTH' },
          { value: `$${fmt(profit * 12)}`,  label: '/YEAR'  },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 600, color: T.black }}>{s.value}</p>
            <p style={{ ...label9, marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ marginTop: 80, borderTop: `1px solid ${T.div}` }} />

      {/* Per client breakdown */}
      <div style={{ marginTop: 48 }}>
        <p style={label9}>PER CLIENT BREAKDOWN</p>
        <div style={{ marginTop: 16, maxWidth: 500 }}>
          <Row label="You charge your client" value={`$${fmtD(earnPerClient)}`} color={T.black} weight={500} borderTop={false} />
          <Row label="HigherUp share"          value={`−$${fmtD(sharePerClient)}`} color={T.ghost} />
          <Row label="You keep"                value={`$${fmtD(profitPerClient)}`} color={T.green}  weight={600} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ marginTop: 48, borderTop: `1px solid ${T.div}` }} />

      {/* Product breakdown */}
      <div style={{ marginTop: 48 }}>
        <p style={label9}>THIS MONTH&apos;S PRODUCT BREAKDOWN</p>
        <div style={{ marginTop: 16, maxWidth: 500 }}>
          <Row label="Total products"           value={`${fmt(totalProducts)}`}    color={T.black} weight={500} borderTop={false} />
          <Row label={`Free (first ${FREE_PRODUCTS_PER_MONTH})`} value={`${fmt(freeProducts)}`} color={T.green} />
          <Row label="Billable products"        value={`${fmt(billableProducts)}`} color={T.sec} />
          <Row label={`HigherUp share ($${PRICE_PER_PRODUCT}/product)`} value={`$${fmtD(higherUpShare)}`} color={T.ghost} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ marginTop: 48, borderTop: `1px solid ${T.div}` }} />

      {/* How it works */}
      <div style={{ marginTop: 48, maxWidth: 440 }}>
        <p style={label9}>HOW IT WORKS</p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: T.sec, lineHeight: 1.7, margin: 0 }}>
            You set your own rate. You charge your clients directly. You keep the majority.
          </p>
          <p style={{ fontSize: 14, color: T.sec, lineHeight: 1.7, margin: 0 }}>
            HigherUp&rsquo;s share of ${PRICE_PER_PRODUCT} per product covers the AI engine that
            optimizes every listing in seconds — the same work that would take you 43 hours by hand.
          </p>
          <p style={{ fontSize: 14, color: T.black, lineHeight: 1.7, margin: 0 }}>
            Your first {FREE_PRODUCTS_PER_MONTH} products every month are always free. The more clients you
            serve, the more you earn. There&rsquo;s no ceiling.
          </p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ marginTop: 48, borderTop: `1px solid ${T.div}` }} />

      {/* Scale table */}
      <div style={{ marginTop: 48 }}>
        <p style={label9}>WHAT YOU KEEP AT SCALE</p>
        <p style={{ marginTop: 6, fontSize: 12, color: '#DDDDDD' }}>At $0.65/product rate</p>
        <div style={{ marginTop: 16, maxWidth: 500 }}>
          {[
            { products: 50,   clients: 1  },
            { products: 200,  clients: 2  },
            { products: 500,  clients: 5  },
            { products: 1000, clients: 10 },
            { products: 2000, clients: 20 },
          ].map((row, i) => {
            const earned = row.products * 0.65
            const share  = calcShare(row.products)
            const keep   = earned - share
            const pct    = earned > 0 ? Math.round((keep / earned) * 100) : 0
            return (
              <div key={row.products} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderTop: i > 0 ? `1px solid ${T.div}` : undefined,
              }}>
                <span style={{ fontSize: 13, color: T.sec }}>{fmt(row.products)} products · {row.clients} client{row.clients !== 1 ? 's' : ''}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.green }}>${fmtD(keep)}</span>
                  <span style={{ fontSize: 11, color: T.ghost, marginLeft: 6 }}>{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
