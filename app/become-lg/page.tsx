'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Notion-style, no Tailwind classes - use inline styles for precision
// Max width 680px, centered, white background

export default function BecomeLGPage() {
  const router = useRouter()
  const [step, setStep] = useState<'landing' | 'form' | 'success'>('landing')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ login_code: string; referral_code: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Enter your name'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/genx/create-lg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name, email }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok || data.error) { setError(data.error || 'Something went wrong'); return }
    setResult({ login_code: data.login_code, referral_code: data.referral_code })
    setStep('success')
  }

  function copyCode() {
    if (!result) return
    navigator.clipboard.writeText(result.login_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const s = {
    page:     { minHeight: '100vh', background: '#FFFFFF', display: 'flex', justifyContent: 'center', padding: '80px 24px 120px' } as React.CSSProperties,
    wrap:     { maxWidth: 680, width: '100%' } as React.CSSProperties,
    h1:       { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 42, fontWeight: 700, color: '#111111', margin: '0 0 48px', lineHeight: 1.2 } as React.CSSProperties,
    body:     { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, color: '#444444', lineHeight: 1.75, margin: '0 0 64px' } as React.CSSProperties,
    section:  { marginBottom: 64 } as React.CSSProperties,
    label:    { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 500, color: '#888888', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 48 } as React.CSSProperties,
    row:      { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid #F0F0F0' } as React.CSSProperties,
    scenario: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 16, color: '#444444' } as React.CSSProperties,
    amount:   { fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 17, fontWeight: 600, color: '#22C55E' } as React.CSSProperties,
    step:     { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, color: '#444444', lineHeight: 1.75, display: 'flex', gap: 16, marginBottom: 14 } as React.CSSProperties,
    num:      { fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 15, color: '#BBBBBB', minWidth: 20, paddingTop: 2 } as React.CSSProperties,
    bullet:   { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, color: '#444444', lineHeight: 1.75, marginBottom: 10, paddingLeft: 12 } as React.CSSProperties,
    faqQ:     { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, fontWeight: 600, color: '#111111', marginBottom: 6, marginTop: 28 } as React.CSSProperties,
    faqA:     { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, color: '#444444', lineHeight: 1.75, margin: 0 } as React.CSSProperties,
    btn:      { display: 'inline-block', background: '#22C55E', color: '#FFFFFF', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, fontWeight: 600, padding: '16px 40px', borderRadius: 9999, border: 'none', cursor: 'pointer', letterSpacing: '-0.01em' } as React.CSSProperties,
    sub:      { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, color: '#AAAAAA', marginTop: 16, textAlign: 'center' as const } as React.CSSProperties,
    input:    { width: '100%', padding: '14px 16px', fontSize: 17, fontFamily: 'Inter, system-ui, sans-serif', border: '1.5px solid #E0E0E0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 16 } as React.CSSProperties,
    err:      { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, color: '#EF4444', marginBottom: 16 } as React.CSSProperties,
    code:     { fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 28, fontWeight: 700, color: '#111111', letterSpacing: '0.1em', background: '#F5F5F5', padding: '16px 24px', borderRadius: 8, display: 'inline-block', marginBottom: 16 } as React.CSSProperties,
  }

  // Success screen
  if (step === 'success' && result) {
    return (
      <div style={s.page}>
        <div style={s.wrap}>
          <p style={{ ...s.label, marginBottom: 32 }}>You&apos;re in</p>
          <h1 style={{ ...s.h1, fontSize: 32, marginBottom: 24 }}>Your GENX account is ready.</h1>
          <p style={{ ...s.body, marginBottom: 32 }}>Save your login code. You&apos;ll need it every time you sign in.</p>
          <div style={{ marginBottom: 48 }}>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Your Login Code</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={s.code}>{result.login_code}</span>
              <button onClick={copyCode} style={{ ...s.btn, background: copied ? '#16A34A' : '#22C55E', padding: '12px 24px', fontSize: 15 }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <p style={{ ...s.body, marginBottom: 32, fontSize: 15, color: '#666666' }}>
            Your referral link: <span style={{ fontFamily: 'monospace', color: '#111111' }}>higherup.me/ref/{result.referral_code}</span>
          </p>
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => router.push('/genx/login')} style={s.btn}>Go to GENX &rarr;</button>
          </div>
        </div>
      </div>
    )
  }

  // Form screen
  if (step === 'form') {
    return (
      <div style={s.page}>
        <div style={s.wrap}>
          <p style={{ ...s.label, marginBottom: 32 }}>Create your account</p>
          <h1 style={{ ...s.h1, fontSize: 32, marginBottom: 40 }}>Takes 30 seconds.</h1>
          <form onSubmit={handleSubmit}>
            <input
              style={s.input}
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <input
              style={s.input}
              type="email"
              placeholder="Email (optional, for recovery)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
            />
            {error && <p style={s.err}>{error}</p>}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button type="submit" style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Creating your account...' : 'Create My Account \u2192'}
              </button>
            </div>
          </form>
          <p style={{ ...s.sub, marginTop: 24 }}>
            <button onClick={() => setStep('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAAAAA', fontSize: 14 }}>&larr; Back</button>
          </p>
        </div>
      </div>
    )
  }

  // Landing screen
  return (
    <div style={s.page}>
      <div style={s.wrap}>

        {/* Header */}
        <h1 style={s.h1}>Become a Lead Generator</h1>

        {/* Pitch */}
        <p style={s.body}>
          HigherUp is an AI-powered tool that optimizes Shopify product listings.
          Virtual Assistants around the world use it to save hours of work.{' '}
          You bring them in. Every product they list, you earn $0.05. Permanently.
        </p>

        {/* The Math */}
        <div style={s.section}>
          <p style={s.label}>The math</p>
          {[
            ['10 VAs \u00d7 300 products', '$150/month'],
            ['50 VAs \u00d7 300 products', '$750/month'],
            ['100 VAs \u00d7 350 products', '$1,750/month'],
            ['500 VAs \u00d7 350 products', '$8,750/month'],
          ].map(([scenario, amount]) => (
            <div key={scenario} style={s.row}>
              <span style={s.scenario}>{scenario}</span>
              <span style={s.amount}>{amount}</span>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={s.section}>
          <p style={s.label}>How it works</p>
          {[
            'You sign up (takes 2 minutes)',
            'You get a unique referral link',
            'You share it \u2014 VAs sign up and start listing',
            'You earn $0.05 per product they list. Forever.',
          ].map((text, i) => (
            <div key={i} style={s.step}>
              <span style={s.num}>{i + 1}.</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* What you get */}
        <div style={s.section}>
          <p style={s.label}>What you get</p>
          {[
            'Your own GENX dashboard with real-time earnings',
            'Unique referral links per platform (Facebook, Instagram, WhatsApp...)',
            'Ready-made recruitment scripts and templates',
            'Outreach tracker to manage your conversations',
            'Leaderboard to see how you rank',
          ].map((item, i) => (
            <p key={i} style={s.bullet}>&mdash; {item}</p>
          ))}
        </div>

        {/* FAQ */}
        <div style={s.section}>
          <p style={s.label}>Common questions</p>
          {[
            ['Is this a scam?', 'No. HigherUp is a real product used by real VAs serving real clients.'],
            ['Is this MLM?', 'No. Single layer. You earn from VAs you bring. No levels, no pyramid.'],
            ['Do I need experience?', 'No. You need a network and willingness to share. We give you everything else.'],
            ['How do I get paid?', 'Monthly via Wise, PayPal, or GCash. Minimum: $10.'],
            ['What does it cost?', 'Nothing. Being an LG is free.'],
          ].map(([q, a]) => (
            <div key={q as string}>
              <p style={s.faqQ}>{q}</p>
              <p style={s.faqA}>{a}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <button onClick={() => setStep('form')} style={s.btn}>Start Now &mdash; It&apos;s Free</button>
          <p style={s.sub}>You&apos;ll have your dashboard and referral link within 2 minutes.</p>
        </div>

      </div>
    </div>
  )
}
