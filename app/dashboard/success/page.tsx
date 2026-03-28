'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getTiers, getTierSync, DEFAULT_TIERS, type Tier } from '@/lib/pricing'

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

// ─── Static data ──────────────────────────────────────────────────────────────

const CHANNELS = [
  {
    title: 'Upwork',
    content: [
      'Search for: product listing, Shopify VA, catalog management, product data entry',
      '"I optimize product listings for Shopify stores. Professional titles, SEO descriptions, meta tags. I can optimize your entire catalog in 24 hours. $0.65/product."',
      'Tip: first client at $0.50/product as a demo. Then $0.65+ for ongoing work.',
      "Most store owners pay $2–5/product to agencies. You're 70% cheaper.",
    ],
  },
  {
    title: 'Facebook Groups',
    content: [
      'Join: Shopify Entrepreneurs, Ecommerce Sellers, Amazon FBA groups.',
      'Don\'t pitch. Add value first. Answer questions about product listings.',
      '"I help Shopify stores with product descriptions and SEO. Happy to optimize 5 listings for free if you want to see the quality."',
      'Groups with 10k+ members convert well. Engage for 1 week before pitching.',
    ],
  },
  {
    title: 'Cold Email',
    content: [
      'Find stores on ProductHunt, Shopify Explore, or Google Shopping.',
      '"Hi [name], I noticed your [store] could benefit from better product descriptions. I optimize Shopify listings for $0.65/product — agencies charge $3–5. Want 5 free samples?"',
      'Send 20 emails per day. Expect 1–2 responses. 40% close rate on responses.',
      'Use Hunter.io or Apollo to find contact emails.',
    ],
  },
  {
    title: 'LinkedIn',
    content: [
      'Search for: Shopify store owner, ecommerce entrepreneur, online retail.',
      'Connect + message: "I help Shopify stores improve search rankings through better product listings. I do 5 free samples — no strings attached."',
      'Post weekly: before/after listing comparisons. Screenshot your results.',
      'Converts slower but clients are bigger (more products, more stable).',
    ],
  },
  {
    title: 'Referrals',
    content: [
      'After month 1 with a client, ask: "Do you know other store owners who need the same?"',
      '"For every referral who becomes a client, I\'ll give you one month of product optimization free."',
      'Referral clients close 80% of the time. Your best growth channel.',
      'Ask every existing client every 3 months.',
    ],
  },
]

const SCRIPT = `I'll optimize 5 of your products for free. No strings attached. If you like the results, I charge $0.65 per product per month to manage your entire catalog. Most store owners see better search rankings within 2 weeks.`

const STORIES = [
  {
    quote: "I manage 8 clients across Germany and Netherlands. 1,600 products per month. I earn $1,040 gross, pay $440 to HigherUp, and keep $600. I work 2 hours a day.",
    author: "Maria, Philippines",
  },
  {
    quote: "I started with 1 client 4 months ago. Followed the cold outreach playbook. Now I have 12 clients. $960 net per month. I quit my call center job.",
    author: "John, Philippines",
  },
  {
    quote: "I focus on beauty stores. 6 clients averaging 400 products each. $900 net plus $180 in affiliate income. All from home.",
    author: "Ana, Indonesia",
  },
]

const FAQ = [
  {
    q: 'Is it worth it with just 1 client?',
    a: "You pay nothing to start. Zero. Work your first month, earn money, and pay your first invoice at the end. By then you already know exactly what you're earning and what HigherUp costs. No risk.",
  },
  {
    q: '38% seems high.',
    a: 'Without us: 1 client, $130, 40 hours. With us: 10 clients, $1,300 gross, $500 share, $800 net, 20 hours. HigherUp\'s share is 38% but you earn 6x more. Would you rather keep 100% of $130 or 62% of $1,300?',
  },
  {
    q: 'What if my clients only have 100 products?',
    a: "100 × $0.65 = $65. HigherUp's share is $50. That's tight. Solution: find clients with 200+ products, or charge $0.80 for small catalogs. Small catalogs are more work per product for the client, so they'll pay more.",
  },
  {
    q: 'Why not just use ChatGPT myself?',
    a: "Try it. You'll spend 2–3 hours per client prompting, formatting, fixing errors. With 3 clients that's 9 hours. HigherUp: 3 uploads, 15 minutes. Your effective rate with HigherUp: $40/hour. Doing it yourself: $6/hour.",
  },
  {
    q: 'What about bigger clients with 1000+ products?',
    a: '1000 products × $0.65 = $650 from one client. HigherUp share: $350. You keep $300 from ONE client. Three of those = $900 net. Working 1 hour per client per month.',
  },
  {
    q: 'What if a client says $0.65 is too expensive?',
    a: "Agencies charge $2–5 per product. Fiverr freelancers charge $0.10 and deliver garbage. You deliver professional, SEO-optimized listings in 24 hours at $0.65. You're 70% cheaper than agencies and 10x better than Fiverr. If they still say no, they're not your client.",
  },
]

const SCENARIO_A_ROWS = [
  { month: 'Month 1',  clients: 1,  note: '' },
  { month: 'Month 2',  clients: 3,  note: '+2 via Upwork' },
  { month: 'Month 3',  clients: 5,  note: '+2 via referrals' },
  { month: 'Month 4',  clients: 6,  note: '+1 cold outreach' },
  { month: 'Month 6',  clients: 8,  note: '' },
  { month: 'Month 12', clients: 12, note: '' },
]

const PRESETS = {
  starter: { clients: 3,  products: 200, price: 0.65 },
  growing: { clients: 7,  products: 300, price: 0.65 },
  full:    { clients: 15, products: 250, price: 0.70 },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: '#F0F0F0', marginBlock: 48 }} />
}

function Label({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 10,
      color: T.ghost,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 20,
      textAlign: 'center',
    }}>
      {text}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuccessPage() {

  // ── State ──────────────────────────────────────────────────────────────────

  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS)

  // Income simulator
  const [simClients,  setSimClients]  = useState('3')
  const [simProducts, setSimProducts] = useState('200')
  const [simPrice,    setSimPrice]    = useState('0.65')
  const [simPreset,   setSimPreset]   = useState<'starter' | 'growing' | 'full' | null>('starter')

  // Scenario
  const [activeScenario,  setActiveScenario]  = useState<'a' | 'b' | 'c' | 'd'>('a')
  const [scenBClients,    setScenBClients]    = useState('5')
  const [scenBProducts,   setScenBProducts]   = useState('200')

  // Open states
  const [openChannel, setOpenChannel] = useState<number | null>(null)
  const [openFaq,     setOpenFaq]     = useState<number | null>(null)
  const [copied,      setCopied]      = useState(false)

  // Affiliate calculator
  const [affReferrals, setAffReferrals] = useState('5')
  const [affAvgFee,    setAffAvgFee]    = useState('100')

  // Scroll fade-in
  const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set([0]))

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    getTiers().then(t => { if (t.length) setTiers(t) })
  }, [])

  useEffect(() => {
    const sections = document.querySelectorAll('[data-section]')
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = Number((e.target as HTMLElement).dataset.section)
          setVisibleSections(prev => new Set([...prev, idx]))
        }
      }),
      { threshold: 0.1 },
    )
    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const sectionStyle = (idx: number): React.CSSProperties => ({
    opacity:   visibleSections.has(idx) ? 1 : 0,
    transform: visibleSections.has(idx) ? 'translateY(0)' : 'translateY(24px)',
    transition: 'opacity 0.5s ease, transform 0.5s ease',
  })

  const numVal = (v: string) => parseFloat(v) || 0

  const applyPreset = (key: 'starter' | 'growing' | 'full') => {
    const p = PRESETS[key]
    setSimClients(String(p.clients))
    setSimProducts(String(p.products))
    setSimPrice(String(p.price))
    setSimPreset(key)
  }

  // ── Sim calculations ───────────────────────────────────────────────────────

  const clients      = numVal(simClients)
  const products     = numVal(simProducts)
  const price        = numVal(simPrice)
  const gross        = clients * products * price
  const feePerClient = (variantCount: number) => getTierSync(tiers, variantCount).amount
  const totalFee     = clients * feePerClient(products)
  const net          = gross - totalFee
  const feePercent   = gross > 0 ? Math.round((totalFee / gross) * 100) : 0
  const hoursPerMonth = clients * 2
  const hoursPerDay   = hoursPerMonth / 22
  const hourlyRate    = hoursPerMonth > 0 ? net / hoursPerMonth : 0

  // ── Affiliate income ───────────────────────────────────────────────────────

  const affIncome = numVal(affReferrals) * numVal(affAvgFee) * 0.20

  // ── Scenario B ─────────────────────────────────────────────────────────────

  const bClients    = numVal(scenBClients)
  const bProducts   = numVal(scenBProducts)
  const bGross      = bClients * bProducts * 0.65
  const bFee        = bClients * getTierSync(tiers, bProducts).amount
  const bNet        = bGross - bFee
  const bFeePct     = bGross > 0 ? Math.round((bFee / bGross) * 100) : 0
  const bEarnMore   = bNet > 0 ? (bNet / 130).toFixed(1) : '0'
  const bHoursSaved = Math.round((1 - (bClients * 2) / 40) * 100)
  const bHourlyRate = bClients > 0 ? (bNet / (bClients * 2)).toFixed(2) : '0.00'

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      paddingBottom: 80,
      fontFamily: "'Inter', system-ui, sans-serif",
      background: T.white,
      minHeight: '100vh',
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px' }}>

        {/* ── HEADER (section 0) ─────────────────────────────────────────── */}
        <div
          data-section="0"
          style={{ ...sectionStyle(0), textAlign: 'center', paddingTop: 64, paddingBottom: 48 }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 300, color: T.black, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            Your path to $800+/month
          </h1>
          <p style={{ fontSize: 14, color: T.ghost, margin: 0 }}>
            The math. The strategy. The playbook.
          </p>
        </div>

        {/* ── SECTION 1: THE MATH (section 1) ──────────────────────────── */}
        <div data-section="1" style={sectionStyle(1)}>

          {/* Two columns */}
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>

            {/* LEFT — Without HigherUp */}
            <div style={{ flex: 1, minWidth: 280, padding: '0 32px' }}>
              <div style={{ fontSize: 11, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                WITHOUT HIGHERUP
              </div>
              <div style={{ fontSize: 14, color: '#999999', marginBottom: 4 }}>1 client</div>
              <div style={{ fontSize: 14, color: '#999999', marginBottom: 4 }}>200 products</div>
              <div style={{ fontSize: 14, color: '#999999', marginBottom: 0 }}>40 hours of manual work</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: '#999999', marginTop: 16 }}>$130/month</div>
              <div style={{ height: 1, background: '#F0F0F0', marginBlock: 16 }} />
              <div style={{ fontSize: 12, color: T.ghost }}>Hourly rate:</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#999999' }}>$3.25/hour</div>
            </div>

            {/* Vertical separator */}
            <div style={{ width: 1, background: '#F0F0F0', alignSelf: 'stretch' }} />

            {/* RIGHT — With HigherUp */}
            <div style={{ flex: 1, minWidth: 280, padding: '0 32px' }}>
              <div style={{ fontSize: 11, color: T.black, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                WITH HIGHERUP
              </div>
              <div style={{ fontSize: 14, color: T.black, marginBottom: 4 }}>10 clients</div>
              <div style={{ fontSize: 14, color: T.black, marginBottom: 4 }}>200 products each</div>
              <div style={{ fontSize: 14, color: T.black, marginBottom: 0 }}>Upload CSV, wait 2 minutes, deliver</div>
              <div style={{ fontSize: 14, color: T.black, marginTop: 16 }}>$1,300/month gross</div>
              <div style={{ fontSize: 14, color: '#999999' }}>−$500 HigherUp share</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: T.black, marginTop: 4 }}>$800/month net</div>
              <div style={{ height: 1, background: '#F0F0F0', marginBlock: 16 }} />
              <div style={{ fontSize: 12, color: T.ghost }}>Hourly rate:</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: T.black }}>$12/hour</div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ marginTop: 40 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: T.black, textAlign: 'center' }}>
              From $3.25/hour to $12/hour. From $130/month to $800/month.
            </div>
            <div style={{ fontSize: 14, color: '#999999', textAlign: 'center', marginTop: 8 }}>
              Same type of work. Same type of clients. 6x more income.
            </div>
          </div>

          {/* Honest truth */}
          <div style={{ marginTop: 40 }}>
            <Label text="THE HONEST TRUTH ABOUT OUR SHARE" />
            <p style={{
              fontSize: 15,
              color: T.black,
              lineHeight: 1.7,
              textAlign: 'center',
              maxWidth: 640,
              margin: '0 auto',
            }}>
              Yes, our share is 38% on Tier 1. That sounds like a lot. But without us, you'd earn $130. With us, you earn $800. You're not losing $500. You're investing $500 to earn $670 extra. That's a 134% return. Every month.
            </p>
          </div>
        </div>

        <Divider />

        {/* ── SECTION 2: INCOME SIMULATOR (section 2) ──────────────────── */}
        <div data-section="2" style={sectionStyle(2)}>
          <Label text="INCOME SIMULATOR" />
          <div style={{ fontSize: 14, color: T.ghost, textAlign: 'center', marginBottom: 32 }}>
            See exactly what you could earn.
          </div>

          {/* Presets */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
            {(['starter', 'growing', 'full'] as const).map(key => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                style={{
                  fontSize: 13,
                  padding: '6px 16px',
                  borderRadius: 100,
                  border: `1px solid ${simPreset === key ? T.black : T.border}`,
                  background: simPreset === key ? T.black : T.white,
                  color: simPreset === key ? T.white : T.gray,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {key === 'starter' ? 'Just starting' : key === 'growing' ? 'Growing' : 'Full capacity'}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', marginBottom: 32 }}>

            {/* Clients */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                CLIENTS
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={simClients}
                onChange={e => {
                  const v = e.target.value
                  if (v === '' || /^\d+$/.test(v)) { setSimClients(v); setSimPreset(null) }
                }}
                onFocus={e => e.currentTarget.select()}
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: T.black,
                  textAlign: 'center',
                  border: 'none',
                  borderBottom: `1.5px solid ${T.border}`,
                  width: 80,
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  padding: '4px 8px',
                }}
              />
            </div>

            {/* Products */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                PRODUCTS PER CLIENT
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={simProducts}
                onChange={e => {
                  const v = e.target.value
                  if (v === '' || /^\d+$/.test(v)) { setSimProducts(v); setSimPreset(null) }
                }}
                onFocus={e => e.currentTarget.select()}
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: T.black,
                  textAlign: 'center',
                  border: 'none',
                  borderBottom: `1.5px solid ${T.border}`,
                  width: 100,
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  padding: '4px 8px',
                }}
              />
            </div>

            {/* Price */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                PRICE PER PRODUCT
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 20, color: T.ghost, marginRight: 4 }}>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={simPrice}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '' || /^\d*\.?\d*$/.test(v)) { setSimPrice(v); setSimPreset(null) }
                  }}
                  onFocus={e => e.currentTarget.select()}
                  style={{
                    fontSize: 28,
                    fontWeight: 500,
                    color: T.black,
                    textAlign: 'center',
                    border: 'none',
                    borderBottom: `1.5px solid ${T.border}`,
                    width: 80,
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    padding: '4px 8px',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Results */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

            {/* Left block — your income */}
            <div style={{ flex: 1, minWidth: 280, padding: 24, background: '#FAFAFA', borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                YOUR INCOME
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: '#999999' }}>Gross income</span>
                <span style={{ fontSize: 18, fontWeight: 500, color: T.black }}>
                  ${gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: '#999999' }}>HigherUp share</span>
                <span style={{ fontSize: 18, color: '#999999' }}>−${totalFee.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: T.ghost }}>Share</span>
                <span style={{ fontSize: 13, color: T.ghost }}>{feePercent}%</span>
              </div>

              <div style={{ height: 1, background: T.border, marginBlock: 8 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: T.black }}>Net income</span>
                <span style={{ fontSize: 28, fontWeight: 600, color: T.black }}>
                  ${net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 13, color: T.ghost }}>Per year</span>
                <span style={{ fontSize: 13, color: T.ghost }}>
                  ${(net * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Right block — your time */}
            <div style={{ flex: 1, minWidth: 280, padding: 24, background: '#FAFAFA', borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                YOUR TIME
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: '#999999' }}>Hours per month</span>
                <span style={{ fontSize: 18, fontWeight: 500, color: T.black }}>{hoursPerMonth.toFixed(0)}h</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: T.ghost }}>Hours per day</span>
                <span style={{ fontSize: 13, color: T.ghost }}>{hoursPerDay.toFixed(1)}h</span>
              </div>

              <div style={{ height: 1, background: T.border, marginBlock: 8 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: T.black }}>Effective hourly rate</span>
                <span style={{ fontSize: 28, fontWeight: 600, color: T.black }}>${hourlyRate.toFixed(2)}/hr</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBlock: 8 }}>
                <span style={{ fontSize: 14, color: T.ghost }}>Manual hourly rate</span>
                <span style={{ fontSize: 14, color: T.ghost }}>$3.25/hour</span>
              </div>
            </div>
          </div>

          {/* Growth projection */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: T.ghost, marginBottom: 8 }}>
              If you add 1 client per month:
            </div>
            <div style={{ fontSize: 14, color: T.black }}>
              Month 6: {Math.round(clients + 5)} clients → ${Math.round((clients + 5) * (price * products - feePerClient(products))).toLocaleString()}/month
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginTop: 4 }}>
              Month 12: {Math.round(clients + 9)} clients → ${Math.round((clients + 9) * (price * products - feePerClient(products))).toLocaleString()}/month
            </div>
          </div>

          {/* Fee breakdown */}
          <div style={{ marginTop: 32 }}>
            <Label text="SHARE BREAKDOWN" />
            <div style={{ fontSize: 13, color: T.gray, textAlign: 'center' }}>
              {clients} client{clients !== 1 ? 's' : ''} × {products} products = {getTierSync(tiers, numVal(simProducts)).display_name} (${getTierSync(tiers, numVal(simProducts)).amount}) each
            </div>
            <div style={{ fontSize: 14, color: T.black, textAlign: 'center', marginTop: 4 }}>
              Total share: ${totalFee.toLocaleString()}
            </div>
          </div>
        </div>

        <Divider />

        {/* ── SECTION 3: PRICING STRATEGY GUIDE (section 3) ────────────── */}
        <div data-section="3" style={sectionStyle(3)}>
          <Label text="WHAT TO CHARGE YOUR CLIENTS" />
          <div style={{ fontSize: 14, color: T.ghost, textAlign: 'center', marginBottom: 32 }}>
            The industry standard is $0.50–$1.00 per product.
          </div>

          {/* Market rates */}
          <Label text="RECOMMENDED RATES BY MARKET" />
          <div style={{ maxWidth: 600, margin: '0 auto', marginBottom: 32 }}>
            <div style={{ display: 'flex', paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Market</div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Rate per product</div>
            </div>
            {[
              ['US / UK / Australia',                '$0.60 – $0.80'],
              ['Germany / Netherlands / Scandinavia', '€0.55 – €0.75'],
              ['Spain / Italy / France',              '€0.45 – €0.65'],
              ['Other markets',                       '$0.50 – $0.70'],
            ].map(([market, rate]) => (
              <div key={market} style={{ display: 'flex', paddingBlock: 10, borderBottom: '1px solid #FAFAFA' }}>
                <div style={{ flex: 1, fontSize: 13, color: T.black }}>{market}</div>
                <div style={{ fontSize: 13, color: T.black }}>{rate}</div>
              </div>
            ))}
          </div>

          {/* Niche rates */}
          <Label text="RECOMMENDED RATES BY NICHE" />
          <div style={{ maxWidth: 600, margin: '0 auto', marginBottom: 32 }}>
            <div style={{ display: 'flex', paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Niche</div>
              <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Rate per product</div>
            </div>
            {[
              ['Fashion (simple, short descriptions)',   '$0.50 – $0.60'],
              ['Electronics (technical, long specs)',    '$0.70 – $0.90'],
              ['Beauty (emotional, ingredients)',        '$0.60 – $0.75'],
              ['Home & Garden',                         '$0.55 – $0.70'],
              ['Health & Fitness',                      '$0.60 – $0.75'],
            ].map(([niche, rate]) => (
              <div key={niche} style={{ display: 'flex', paddingBlock: 10, borderBottom: '1px solid #FAFAFA' }}>
                <div style={{ flex: 1, fontSize: 13, color: T.black }}>{niche}</div>
                <div style={{ fontSize: 13, color: T.black }}>{rate}</div>
              </div>
            ))}
          </div>

          {/* Three models */}
          <Label text="THREE PRICING MODELS" />

          {/* Model A */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: T.black }}>Per product</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: T.black, border: '1px solid #111', borderRadius: 100, padding: '2px 8px', letterSpacing: '0.06em' }}>
                RECOMMENDED
              </div>
            </div>
            <div style={{ fontSize: 14, color: T.gray, marginBottom: 8 }}>
              Charge $0.60–$0.70 per product. Fair. Scales with the client. Easy to explain.
            </div>
            <div style={{ fontSize: 13, color: T.black }}>200 products × $0.65 = $130/month</div>
            <div style={{ fontSize: 13, color: T.black }}>500 products × $0.65 = $325/month</div>
          </div>

          {/* Model B */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 8 }}>Fixed monthly rate</div>
            <div style={{ fontSize: 14, color: T.gray, marginBottom: 4 }}>
              Charge $130/month for up to 200 products. Set a cap. Extra products: $0.50 each.
            </div>
            <div style={{ fontSize: 13, color: T.ghost }}>Predictable for the client. But set a product limit.</div>
          </div>

          {/* Model C */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: T.black, marginBottom: 8 }}>Performance-based</div>
            <div style={{ fontSize: 14, color: T.gray, marginBottom: 4 }}>
              Base $80/month + bonus per sale from optimized listings. Only if client shares analytics.
            </div>
            <div style={{ fontSize: 13, color: T.ghost }}>
              Higher upside but harder to set up. For experienced listers.
            </div>
          </div>

          {/* Minimum price */}
          <Label text="YOUR MINIMUM PRICE" />
          <div style={{ fontSize: 15, fontWeight: 500, color: T.black, marginBottom: 8 }}>
            Never charge less than $0.50 per product.
          </div>
          <div style={{ fontSize: 13, color: '#999999', marginBottom: 16 }}>Here's why:</div>
          <div style={{ fontSize: 14, color: T.black, marginBottom: 12 }}>
            For every $0.65 your client pays you:
          </div>

          <div style={{ width: '100%', height: 32, borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 16 }}>
            <div style={{ width: '62%', background: T.black, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: T.white, fontWeight: 500 }}>$0.40 — your profit</span>
            </div>
            <div style={{ width: '38%', background: '#EEEEEE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: T.gray }}>$0.25 — HigherUp</span>
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#999999', marginBottom: 24 }}>
            You invest nothing. No software. No AI subscriptions. No tools. Just upload and earn.
          </div>

          {/* Scale table */}
          <Label text="AND IT GETS BETTER AT SCALE" />
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ display: 'flex', paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tier</div>
              <div style={{ width: 140, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Fee per product</div>
              <div style={{ width: 120, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your margin</div>
            </div>
            {tiers.map(tier => {
              const midCount      = tier.max_variants
                ? Math.round((tier.min_variants + tier.max_variants) / 2)
                : tier.min_variants * 2
              const feePerProduct  = tier.amount / midCount
              const profit         = 0.65 - feePerProduct
              const margin         = Math.round((profit / 0.65) * 100)
              const range          = tier.max_variants
                ? `≤${tier.max_variants.toLocaleString()}`
                : `${tier.min_variants.toLocaleString()}+`
              return (
                <div key={tier.id} style={{ display: 'flex', paddingBlock: 10, borderBottom: '1px solid #FAFAFA' }}>
                  <div style={{ flex: 1, fontSize: 13, color: T.black }}>{tier.display_name} ({range})</div>
                  <div style={{ width: 140, fontSize: 13, color: T.gray }}>${feePerProduct.toFixed(3)}/product</div>
                  <div style={{ width: 120, fontSize: 13, color: T.black }}>{margin}% margin</div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginTop: 16 }}>
            The more products your clients have, the more you keep per product.
          </div>
        </div>

        <Divider />

        {/* ── SECTION 4: HOW TO GET CLIENTS (section 4) ────────────────── */}
        <div data-section="4" style={sectionStyle(4)}>
          <Label text="HOW TO GET CLIENTS" />
          <div style={{ fontSize: 14, color: T.ghost, textAlign: 'center', marginBottom: 32 }}>
            5 channels. 1 killer script. Your first client in 7 days.
          </div>

          {/* Channels */}
          {CHANNELS.map((ch, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenChannel(openChannel === i ? null : i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBlock: 14,
                  borderBottom: `1px solid #F5F5F5`,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 500, color: T.black }}>{ch.title}</span>
                <span style={{
                  fontSize: 12,
                  color: T.ghost,
                  transform: openChannel === i ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                  flexShrink: 0,
                }}>▼</span>
              </button>
              {openChannel === i && (
                <div style={{ marginTop: 12, paddingBottom: 12, borderBottom: `1px solid #F5F5F5` }}>
                  {ch.content.map((line, j) => {
                    const isScript = line.startsWith('"') || line.startsWith("'")
                    return (
                      <div
                        key={j}
                        style={{
                          fontSize: 13,
                          color: isScript ? T.black : '#999999',
                          fontStyle: isScript ? 'italic' : 'normal',
                          marginBottom: 8,
                        }}
                      >
                        {line}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Sample script */}
          <div style={{ marginTop: 40 }}>
            <Label text="THE FREE SAMPLE SCRIPT" />
            <div style={{ background: '#FAFAFA', borderRadius: 12, padding: 24, position: 'relative' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 16 }}>
                This converts 40%+ of prospects.
              </div>
              <div style={{ fontSize: 15, color: T.black, fontStyle: 'italic', lineHeight: 1.7 }}>
                {SCRIPT}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SCRIPT)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                style={{
                  position: 'absolute',
                  bottom: 16,
                  right: 16,
                  fontSize: 12,
                  color: copied ? T.green : T.ghost,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>

          {/* The numbers */}
          <div style={{ marginTop: 32 }}>
            <Label text="THE NUMBERS" />
            <div style={{ fontSize: 14, color: T.black, marginBottom: 4 }}>
              Send 10 free samples → 4 become clients (40%)
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 4 }}>
              4 clients × 200 products × $0.65 = $520/month
            </div>
            <div style={{ fontSize: 13, color: '#999999' }}>
              Time investment: 1 hour to send samples. Return: $520/month recurring.
            </div>
          </div>
        </div>

        <Divider />

        {/* ── SECTION 5: SCENARIO SIMULATOR (section 5) ────────────────── */}
        <div data-section="5" style={sectionStyle(5)}>
          <Label text="SCENARIO SIMULATOR" />
          <div style={{ fontSize: 14, color: T.ghost, textAlign: 'center', marginBottom: 32 }}>
            Pick your situation. See your future.
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
            {(['a', 'b', 'c', 'd'] as const).map(key => (
              <button
                key={key}
                onClick={() => setActiveScenario(key)}
                style={{
                  fontSize: 13,
                  padding: '6px 16px',
                  borderRadius: 100,
                  border: `1px solid ${activeScenario === key ? T.black : T.border}`,
                  background: activeScenario === key ? T.black : T.white,
                  color: activeScenario === key ? T.white : T.gray,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {key === 'a' ? 'Just started' : key === 'b' ? 'Worried about the share' : key === 'c' ? 'Ready to scale' : 'The 3-year plan'}
              </button>
            ))}
          </div>

          {/* Scenario A */}
          {activeScenario === 'a' && (
            <div>
              <div style={{ display: 'flex', paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 100, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Month</div>
                <div style={{ width: 80, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Clients</div>
                <div style={{ width: 80, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gross</div>
                <div style={{ width: 80, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Share</div>
                <div style={{ width: 80, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Net</div>
                <div style={{ flex: 1, fontSize: 10, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hours/day</div>
              </div>
              {SCENARIO_A_ROWS.map(row => {
                const rGross    = row.clients * 200 * 0.65
                const rFee      = row.clients * getTierSync(tiers, 200).amount
                const rNet      = rGross - rFee
                const rHoursDay = (row.clients * 2 / 22).toFixed(1)
                return (
                  <div key={row.month} style={{ display: 'flex', alignItems: 'center', paddingBlock: 10, borderBottom: '1px solid #FAFAFA' }}>
                    <div style={{ width: 100, fontSize: 13, color: '#999999' }}>{row.month}</div>
                    <div style={{ width: 80, fontSize: 13, color: T.black }}>{row.clients}</div>
                    <div style={{ width: 80, fontSize: 13, color: '#999999' }}>${rGross.toLocaleString()}</div>
                    <div style={{ width: 80, fontSize: 13, color: '#999999' }}>−${rFee.toLocaleString()}</div>
                    <div style={{ width: 80, fontSize: 13, fontWeight: 500, color: T.black }}>${rNet.toLocaleString()}</div>
                    <div style={{ flex: 1, fontSize: 13, color: T.ghost }}>{rHoursDay}h/day</div>
                  </div>
                )
              })}
              <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginTop: 24 }}>
                By month 4: $480/month net. By month 12: working full days as a professional lister.
              </div>
            </div>
          )}

          {/* Scenario B */}
          {activeScenario === 'b' && (
            <div>
              {/* Inputs */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 32, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.black }}>
                  <span>Clients:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={scenBClients}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setScenBClients(v) }}
                    onFocus={e => e.currentTarget.select()}
                    style={{
                      width: 60, fontSize: 20, fontWeight: 500, color: T.black,
                      textAlign: 'center', border: 'none', borderBottom: `1.5px solid ${T.border}`,
                      outline: 'none', background: 'transparent', fontFamily: 'inherit', padding: '4px 8px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.black }}>
                  <span>Products/client:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={scenBProducts}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setScenBProducts(v) }}
                    onFocus={e => e.currentTarget.select()}
                    style={{
                      width: 80, fontSize: 20, fontWeight: 500, color: T.black,
                      textAlign: 'center', border: 'none', borderBottom: `1.5px solid ${T.border}`,
                      outline: 'none', background: 'transparent', fontFamily: 'inherit', padding: '4px 8px',
                    }}
                  />
                </div>
              </div>

              {/* Two columns */}
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 280, padding: '0 32px 0 0' }}>
                  <div style={{ fontSize: 11, color: T.ghost, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                    WITHOUT HIGHERUP
                  </div>
                  <div style={{ fontSize: 13, color: '#999999', marginBottom: 4 }}>Max clients: 1–2</div>
                  <div style={{ fontSize: 13, color: '#999999', marginBottom: 4 }}>Income: $130–$260</div>
                  <div style={{ fontSize: 13, color: '#999999', marginBottom: 4 }}>Hours: 40–80/month</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#999999', marginTop: 12 }}>$3.25/hour</div>
                </div>

                <div style={{ width: 1, background: '#F0F0F0', alignSelf: 'stretch' }} />

                <div style={{ flex: 1, minWidth: 280, padding: '0 0 0 32px' }}>
                  <div style={{ fontSize: 11, color: T.black, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                    WITH HIGHERUP
                  </div>
                  <div style={{ fontSize: 13, color: T.black, marginBottom: 4 }}>
                    Clients: {bClients}
                  </div>
                  <div style={{ fontSize: 13, color: T.black, marginBottom: 4 }}>
                    Gross: ${bGross.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: T.black, marginBottom: 4 }}>
                    Share: ${bFee.toLocaleString()} ({bFeePct}%)
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.black, marginBottom: 4 }}>
                    Net: ${bNet.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: T.black, marginBottom: 4 }}>
                    Hours: {(bClients * 2).toFixed(0)}/month
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: T.black, marginTop: 12 }}>
                    ${bHourlyRate}/hour
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginTop: 24 }}>
                HigherUp's share: {bFeePct}%. You earn {bEarnMore}x more. You work {Math.abs(bHoursSaved)}% {bHoursSaved > 0 ? 'fewer' : 'more'} hours.
              </div>
            </div>
          )}

          {/* Scenario C */}
          {activeScenario === 'c' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 4 }}>
                  20 clients at 200 products each
                </div>
                <div style={{ fontSize: 14, color: T.black }}>
                  Gross: ${(20 * 200 * 0.65).toLocaleString()} · Share: ${(20 * getTierSync(tiers, 200).amount).toLocaleString()} · Net: ${(20 * 200 * 0.65 - 20 * getTierSync(tiers, 200).amount).toLocaleString()}/month
                </div>
                <div style={{ fontSize: 13, color: T.gray, marginTop: 4 }}>
                  Hours: {20 * 2}/month · ${((20 * 200 * 0.65 - 20 * getTierSync(tiers, 200).amount) / (20 * 2)).toFixed(2)}/hour
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginBottom: 4 }}>
                  5 clients at 500 products each (Professional tier)
                </div>
                <div style={{ fontSize: 14, color: T.black }}>
                  Gross: ${(5 * 500 * 0.65).toLocaleString()} · Share: ${(5 * getTierSync(tiers, 500).amount).toLocaleString()} · Net: ${(5 * 500 * 0.65 - 5 * getTierSync(tiers, 500).amount).toLocaleString()}/month
                </div>
                <div style={{ fontSize: 13, color: T.gray, marginTop: 4 }}>
                  Hours: {5 * 2}/month · ${((5 * 500 * 0.65 - 5 * getTierSync(tiers, 500).amount) / (5 * 2)).toFixed(2)}/hour · Same income, less juggling.
                </div>
              </div>
            </div>
          )}

          {/* Scenario D */}
          {activeScenario === 'd' && (
            <div>
              {[
                { year: 'YEAR 1', desc: '10 clients · $800/month net · $9,600/year' },
                { year: 'YEAR 2', desc: '20 clients · $1,600/month net · $19,200/year' },
                { year: 'YEAR 3', desc: '30 clients + affiliates · $2,700/month net · $32,400/year' },
              ].map(y => (
                <div key={y.year} style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, color: T.ghost, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {y.year}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: T.black }}>{y.desc}</div>
                </div>
              ))}
              <div style={{ fontSize: 15, fontWeight: 500, color: T.black, lineHeight: 1.6 }}>
                In 3 years: $32,400/year from your laptop. No office. No boss. No ceiling.
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── SECTION 6: COST OF NOT USING (section 6) ─────────────────── */}
        <div data-section="6" style={{ ...sectionStyle(6), textAlign: 'center' }}>
          <Label text="WHAT YOU LOSE EVERY MONTH WITHOUT HIGHERUP" />

          <div style={{ fontSize: 56, fontWeight: 600, color: T.black, marginBottom: 4 }}>$720</div>
          <div style={{ fontSize: 14, color: '#999999', marginBottom: 24 }}>lost every month</div>

          <div style={{ fontSize: 14, color: T.gray, marginBottom: 8 }}>
            The difference between $800/month and $130/month is $670.
          </div>
          <div style={{ fontSize: 14, color: T.gray, marginBottom: 8 }}>
            Across 12 months: $8,040 in lost income.
          </div>
          <div style={{ fontSize: 14, color: T.gray, marginBottom: 40 }}>
            That's a year of rent in the Philippines. Gone.
          </div>

          <Label text="THE ROI" />
          <div style={{ fontSize: 16, color: T.black, marginBottom: 8 }}>You invest: $50/month (Tier 1 share)</div>
          <div style={{ fontSize: 16, color: T.black, marginBottom: 8 }}>You earn: $800/month net</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: T.black, marginBottom: 8 }}>Return: 1,500%</div>
          <div style={{ fontSize: 14, color: T.gray, marginBottom: 40 }}>
            There is no investment with a better return.
          </div>

          <Label text="PER DAY" />
          <div style={{ fontSize: 16, fontWeight: 500, color: T.black }}>
            Every day without HigherUp costs you $24.
          </div>
          <div style={{ fontSize: 14, color: '#999999', marginTop: 4 }}>
            That's a restaurant meal in Manila. Gone. Every day.
          </div>
        </div>

        <Divider />

        {/* ── SECTION 7: WHERE MONEY GOES (section 7) ──────────────────── */}
        <div data-section="7" style={sectionStyle(7)}>
          <Label text="WHERE EVERY DOLLAR GOES" />

          {tiers.map(tier => {
            const midCount       = tier.max_variants
              ? Math.round((tier.min_variants + tier.max_variants) / 2)
              : tier.min_variants * 2
            const feePerProduct  = tier.amount / midCount
            const profitPerProd  = 0.65 - feePerProduct
            const profitPct      = Math.max(5, Math.min(95, Math.round((profitPerProd / 0.65) * 100)))
            const feePct         = 100 - profitPct
            const range          = tier.max_variants
              ? `≤${tier.max_variants.toLocaleString()}`
              : `${tier.min_variants.toLocaleString()}+`

            return (
              <div key={tier.id} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: T.ghost, marginBottom: 6 }}>
                  {tier.display_name} ({range} products)
                </div>
                <div style={{ width: '100%', height: 28, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${profitPct}%`, background: T.black, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: T.white, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      YOUR PROFIT · ${profitPerProd.toFixed(2)} · {profitPct}%
                    </span>
                  </div>
                  <div style={{ width: `${feePct}%`, background: '#EEEEEE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: T.gray, whiteSpace: 'nowrap' }}>
                      HigherUp · ${feePerProduct.toFixed(3)} · {feePct}%
                    </span>
                  </div>
                </div>
              </div>
            )
          })}

          <div style={{ fontSize: 14, fontWeight: 500, color: T.black, marginTop: 24 }}>
            The more your clients grow, the more you keep.
          </div>
          <div style={{ fontSize: 14, color: '#999999', marginTop: 8 }}>
            You invest nothing. No software. No AI subscriptions. No tools. Upload and earn.
          </div>
        </div>

        <Divider />

        {/* ── SECTION 8: SUCCESS STORIES (section 8) ───────────────────── */}
        <div data-section="8" style={sectionStyle(8)}>
          <Label text="FROM LISTERS LIKE YOU" />

          {STORIES.map(s => (
            <div key={s.author} style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 40, color: T.ghost, lineHeight: 1, marginBottom: -8 }}>"</div>
              <div style={{ fontSize: 15, color: T.black, fontStyle: 'italic', lineHeight: 1.7, marginBottom: 12 }}>
                {s.quote}
              </div>
              <div style={{ fontSize: 13, color: T.gray }}>— {s.author}</div>
            </div>
          ))}

          <div style={{ fontSize: 11, color: '#DDDDDD', fontStyle: 'italic' }}>
            These are placeholder stories for now.
          </div>
        </div>

        <Divider />

        {/* ── SECTION 9: FAQ (section 9) ────────────────────────────────── */}
        <div data-section="9" style={sectionStyle(9)}>
          <Label text="COMMON QUESTIONS" />

          {FAQ.map((item, i) => (
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
                <div style={{ fontSize: 14, color: '#999999', lineHeight: 1.6, paddingTop: 12, paddingBottom: 16 }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <Divider />

        {/* ── SECTION 10: AFFILIATE TEASER (section 10) ────────────────── */}
        <div data-section="10" style={sectionStyle(10)}>
          <Label text="EARN EVEN MORE — WITHOUT MORE CLIENTS" />

          <div style={{ fontSize: 16, fontWeight: 500, color: T.black, textAlign: 'center', marginBottom: 24 }}>
            Refer other listers. Earn 20% of what they pay us. Every month. Forever.
          </div>

          {/* Mini calculator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center', fontSize: 13, color: T.black }}>
            <input
              type="text"
              inputMode="numeric"
              value={affReferrals}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setAffReferrals(v) }}
              onFocus={e => e.currentTarget.select()}
              style={{
                width: 60, fontSize: 13, textAlign: 'center',
                border: `1px solid ${T.border}`, borderRadius: 6,
                padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <span>referrals paying an average of $</span>
            <input
              type="text"
              inputMode="numeric"
              value={affAvgFee}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setAffAvgFee(v) }}
              onFocus={e => e.currentTarget.select()}
              style={{
                width: 70, fontSize: 13, textAlign: 'center',
                border: `1px solid ${T.border}`, borderRadius: 6,
                padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <span>/month to HigherUp</span>
          </div>

          <div style={{ fontSize: 24, fontWeight: 600, color: T.black, textAlign: 'center', marginTop: 16 }}>
            Your monthly affiliate income: ${affIncome.toFixed(0)}
          </div>
          <div style={{ fontSize: 13, color: '#999999', textAlign: 'center', marginTop: 4 }}>
            On top of your client income. Without extra work.
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Link
              href="/dashboard/affiliates"
              style={{ fontSize: 13, color: T.black, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Go to your affiliate page →
            </Link>
          </div>
        </div>

        <Divider />

        {/* ── FOOTER (section 11) ───────────────────────────────────────── */}
        <div data-section="11" style={{ ...sectionStyle(11), textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 300, color: T.black, marginBottom: 16 }}>
            Stop calculating. Start uploading.
          </div>
          <Link
            href="/dashboard/upload"
            style={{ fontSize: 14, color: T.black, textDecoration: 'underline' }}
          >
            Upload your first CSV →
          </Link>

          <div style={{ marginTop: 48, fontSize: 10, color: '#DDDDDD', marginBottom: 48 }}>
            HigherUp
          </div>
        </div>

      </div>
    </div>
  )
}
