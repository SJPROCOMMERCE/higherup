'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { RevealText }   from '@/components/RevealText'
import { CountUp }      from '@/components/CountUp'
import { RevealScreen } from '@/components/RevealScreen'

// ─── Step map ─────────────────────────────────────────────────────────────────
// 1  = FORM: Name
// 2  = REVEAL 1: Het probleem
// 3  = REVEAL 2: De oplossing
// 4  = FORM: Land
// 5  = REVEAL 3: Jouw realiteit
// 6  = REVEAL 4: De vergelijking
// 7  = FORM: Payout methode
// 8  = REVEAL 5: Eén upload
// 9  = REVEAL 6: Tien clients
// 10 = REVEAL 7: Het jaarperspectief
// 11 = FORM: Referral code
// 12 = REVEAL 8: Je start nu  (→ triggers submit)
// 13 = BEVESTIGING

const TOTAL_STEPS = 13
type StepNum = 1|2|3|4|5|6|7|8|9|10|11|12|13

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  firstName:      string
  lastName:       string
  country:        string
  phone:          string
  paymentMethod:  string
  paymentDetails: Record<string, string>
  referralCode:   string
}

type RefState = 'idle' | 'checking' | 'valid' | 'invalid'

// ─── Country data ─────────────────────────────────────────────────────────────

const COUNTRY_SALARY: Record<string, number> = {
  'Philippines': 400, 'Indonesia': 300, 'India': 350, 'Pakistan': 250,
  'Bangladesh': 200, 'Nigeria': 200, 'Kenya': 250, 'South Africa': 400,
  'Vietnam': 300, 'Colombia': 350, 'Mexico': 400,
}
const DEFAULT_SALARY = 350

// ─── Countries ────────────────────────────────────────────────────────────────

const COUNTRIES = [
  'Philippines', 'Indonesia', 'India', 'Pakistan', 'Bangladesh',
  'Sri Lanka', 'Nepal', 'Vietnam', 'Malaysia', 'Thailand',
  'Myanmar', 'Cambodia', 'Nigeria', 'Kenya', 'South Africa',
  'Ghana', 'Egypt', 'Mexico', 'Colombia', 'Brazil',
  'Argentina', 'Peru', 'Romania', 'Ukraine', 'Poland',
  'Turkey', 'Other',
]

// ─── Payment methods ──────────────────────────────────────────────────────────

function getPaymentMethods(country: string): string[] {
  switch (country) {
    case 'Philippines': return ['Wise', 'PayPal', 'GCash', 'Maya']
    case 'Indonesia':   return ['Wise', 'PayPal', 'Bank Transfer']
    case 'India':       return ['Wise', 'PayPal', 'UPI', 'Bank Transfer']
    case 'Pakistan':    return ['Wise', 'JazzCash', 'EasyPaisa', 'Bank Transfer']
    case 'Bangladesh':  return ['Wise', 'PayPal', 'bKash', 'Bank Transfer']
    default:            return ['Wise', 'PayPal', 'Bank Transfer']
  }
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black: '#111111', gray: '#999999', ghost: '#CCCCCC',
  light: '#DDDDDD', border: '#EEEEEE', bg: '#FFFFFF',
  green: '#2DB87E', red: '#EF4444', row: '#FAFAFA',
}

const label10: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: T.ghost, marginBottom: 8,
}

const inputBase: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none',
  borderBottom: `1.5px solid ${T.border}`, outline: 'none',
  fontSize: 16, color: T.black, paddingBottom: 12, paddingTop: 6,
  fontFamily: 'inherit', boxSizing: 'border-box',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, autoFocus, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; autoFocus?: boolean; type?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={label10}>{label}</div>
      <input
        ref={ref} type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={inputBase}
        onFocus={e => { e.target.style.borderBottomColor = T.black }}
        onBlur={e  => { e.target.style.borderBottomColor = T.border }}
      />
    </div>
  )
}

// ─── ContinueBtn ──────────────────────────────────────────────────────────────

function ContinueBtn({ label = 'Continue', disabled, onClick, loading }: {
  label?: string; disabled?: boolean; onClick?: () => void; loading?: boolean
}) {
  const on = !disabled && !loading
  return (
    <button
      disabled={!on} onClick={onClick}
      style={{
        width: '100%', padding: '15px 0', borderRadius: 10,
        fontSize: 14, fontWeight: 500, border: 'none',
        cursor: on ? 'pointer' : 'not-allowed',
        background: on ? T.black : '#F5F5F5',
        color:      on ? T.bg    : T.ghost,
        fontFamily: 'inherit', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (on) e.currentTarget.style.opacity = '0.88' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {loading ? '···' : label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingForm({ token, inviteId }: { token: string; inviteId: string }) {
  const mobile = useMobile()

  const [step,         setStep]         = useState<StepNum>(1)
  const [transitioning, setTransitioning] = useState(false)

  const [form, setForm] = useState<FormData>({
    firstName: '', lastName: '', country: '', phone: '',
    paymentMethod: '', paymentDetails: {}, referralCode: '',
  })

  // Country dropdown
  const [cOpen,  setCOpen]  = useState(false)
  const [cQuery, setCQuery] = useState('')
  const cRef = useRef<HTMLDivElement>(null)

  // Referral
  const [refState, setRefState] = useState<RefState>('idle')
  const [refName,  setRefName]  = useState<string | null>(null)
  const [refVaId,  setRefVaId]  = useState<string | null>(null)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [loginCode,  setLoginCode]  = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  // Close country dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cRef.current && !cRef.current.contains(e.target as Node)) setCOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Referral code validation (debounce 500ms)
  useEffect(() => {
    const v = form.referralCode.trim().toUpperCase()
    if (!v) { setRefState('idle'); setRefName(null); setRefVaId(null); return }
    setRefState('checking')
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/affiliates/validate-code?code=${encodeURIComponent(v)}`)
        const data = await res.json() as { valid: boolean; referrer_name?: string; referrer_va_id?: string }
        if (data.valid) {
          setRefState('valid'); setRefName(data.referrer_name ?? null); setRefVaId(data.referrer_va_id ?? null)
        } else {
          setRefState('invalid'); setRefName(null); setRefVaId(null)
        }
      } catch { setRefState('invalid') }
    }, 500)
    return () => clearTimeout(t)
  }, [form.referralCode])

  // ── Transition ───────────────────────────────────────────────────────────────

  function goTo(next: StepNum) {
    setTransitioning(true)
    setTimeout(() => {
      setStep(next)
      setTransitioning(false)
    }, 280)
  }

  function goForward() {
    if (step < 12) goTo((step + 1) as StepNum)
    // Step 12 → submit handled in RevealScreen's onContinue
  }

  // ── Payment helpers ──────────────────────────────────────────────────────────

  function pd(key: string) { return form.paymentDetails[key] ?? '' }
  function setPd(key: string, val: string) {
    setForm(f => ({ ...f, paymentDetails: { ...f.paymentDetails, [key]: val } }))
  }

  function renderPaymentDetails() {
    const m = form.paymentMethod
    if (!m) return null
    const emailField = (key: string, label: string) => (
      <Field key={key} label={label} value={pd(key)} onChange={v => setPd(key, v)} placeholder="your@email.com" />
    )
    const textField = (key: string, label: string, ph: string) => (
      <Field key={key} label={label} value={pd(key)} onChange={v => setPd(key, v)} placeholder={ph} />
    )
    if (m === 'Wise')   return emailField('wise_email', 'Wise email')
    if (m === 'PayPal') return emailField('paypal_email', 'PayPal email')
    if (['GCash', 'Maya', 'bKash', 'JazzCash', 'EasyPaisa', 'UPI'].includes(m)) return <>
      {textField('account_number', 'Account number', m === 'UPI' ? 'yourname@upi' : '+XX XXX XXX XXXX')}
      {textField('holder_name', 'Account holder name', 'Your full name')}
    </>
    if (m === 'Bank Transfer') return <>
      {textField('bank_name', 'Bank name', 'e.g. BDO, BCA, SBI')}
      {textField('holder_name', 'Account holder name', 'Full legal name on account')}
      {textField('account_number', 'Account number', 'Your bank account number')}
      {textField('swift', 'SWIFT / BIC code', 'e.g. BPABORPH (optional)')}
      {textField('iban', 'IBAN', 'IBAN if applicable (optional)')}
    </>
    return null
  }

  function isPaymentReady() {
    const m = form.paymentMethod; const d = form.paymentDetails
    if (!m) return false
    if (m === 'Wise')   return !!d.wise_email?.trim()
    if (m === 'PayPal') return !!d.paypal_email?.trim()
    if (['GCash', 'Maya', 'bKash', 'JazzCash', 'EasyPaisa', 'UPI'].includes(m))
      return !!d.account_number?.trim() && !!d.holder_name?.trim()
    if (m === 'Bank Transfer')
      return !!d.bank_name?.trim() && !!d.holder_name?.trim() && !!d.account_number?.trim()
    return false
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const codeRes  = await fetch('/api/auth/generate-login-code', { method: 'POST' })
      const codeData = await codeRes.json() as { code?: string }
      const code     = codeData.code

      const { data: newVa, error: vaErr } = await supabase.from('vas').insert({
        name:                `${form.firstName.trim()} ${form.lastName.trim()}`,
        country:             form.country || null,
        phone_number:        form.phone.trim() || null,
        payment_method:      form.paymentMethod,
        payment_details:     form.paymentDetails,
        status:              'pending_approval',
        login_code:          code ?? null,
        onboarding_complete: true,
        agreed_to_terms:     true,
        agreed_at:           new Date().toISOString(),
      }).select().single()

      if (vaErr || !newVa) throw new Error(vaErr?.message ?? 'Failed to create account')

      // Generate referral code for new VA
      await fetch('/api/affiliates/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ va_id: newVa.id }),
      })

      // Register affiliate relation
      if (refState === 'valid' && refVaId && form.referralCode.trim()) {
        const refCode = form.referralCode.trim().toUpperCase()
        const regRes  = await fetch('/api/affiliates/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referred_va_id: newVa.id, referral_code: refCode }),
        })
        const regData = await regRes.json() as { ok?: boolean }
        if (!regData.ok) {
          const { data: rcRow } = await supabase
            .from('referral_codes').select('va_id, code')
            .eq('code', refCode).maybeSingle()
          if (rcRow?.va_id && rcRow.va_id !== newVa.id) {
            await supabase.from('affiliates').insert({
              referrer_va_id: rcRow.va_id, referred_va_id: newVa.id, is_active: true,
            })
          }
        }
      }

      // Mark invite used
      await supabase.from('invites').update({ used: true }).eq('id', inviteId)

      setLoginCode(code ?? null)
      goTo(13)
    } catch (err) {
      console.error('[onboarding] submit error:', err)
      setSubmitting(false)
    }
  }, [form, refState, refVaId, inviteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ───────────────────────────────────────────────────────────

  const firstName   = form.firstName.trim() || 'you'
  const avgSalary   = COUNTRY_SALARY[form.country] ?? DEFAULT_SALARY
  const bigNum      = (n: number) => mobile ? Math.min(n, 48) : n
  const filteredCountries = cQuery
    ? COUNTRIES.filter(c => c.toLowerCase().includes(cQuery.toLowerCase()))
    : COUNTRIES

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '0 24px 40px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo */}
      <div style={{
        height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: T.black }}>
          HigherUp
        </span>
      </div>

      {/* Content — key={step} forces remount → resets all RevealText/CountUp animations */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          key={step}
          style={{
            width: '100%', maxWidth: 440,
            opacity:    transitioning ? 0 : 1,
            transition: `opacity ${transitioning ? '0.18s' : '0.28s'} ease`,
          }}
        >

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 1 — FORM: Name                                             */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 300, color: T.black, textAlign: 'center', marginBottom: 40, lineHeight: 1.4 }}>
                {(() => {
                  const f = form.firstName.trim(); const l = form.lastName.trim()
                  const bothFilled = f.length >= 1 && l.length >= 1
                  const display    = f || '...'
                  const trailing   = bothFilled ? '.' : l ? '…' : f ? ' …' : '…'
                  return <>Welcome, <span style={{ fontWeight: 400 }}>{display}{f && l ? ` ${l}` : ''}</span>{trailing}</>
                })()}
              </div>
              <Field label="First name" value={form.firstName} onChange={v => setForm(f => ({ ...f, firstName: v }))} placeholder="First name" autoFocus />
              <Field label="Last name"  value={form.lastName}  onChange={v => setForm(f => ({ ...f, lastName:  v }))} placeholder="Last name"  />
              <div style={{ marginTop: 32 }}>
                <ContinueBtn
                  disabled={form.firstName.trim().length < 2 || form.lastName.trim().length < 2}
                  onClick={goForward}
                />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 2 — REVEAL 1: Het probleem                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <RevealScreen onContinue={goForward} continueDelay={3500}>
              <RevealText delay={0} style={{ fontSize: bigNum(56), fontWeight: 600, color: T.black, lineHeight: 1, marginBottom: 20 }}>
                13 minutes.
              </RevealText>
              <RevealText delay={800} style={{ fontSize: 15, color: T.gray, marginBottom: 20 }}>
                That&apos;s how long it takes to list one product by hand.
              </RevealText>
              <RevealText delay={2000} style={{ fontSize: 18, fontWeight: 500, color: T.black }}>
                200 products = 43 hours.
              </RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 3 — REVEAL 2: De oplossing                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <RevealScreen onContinue={goForward} continueDelay={4000}>
              <RevealText delay={0} style={{ fontSize: bigNum(56), fontWeight: 600, color: T.black, lineHeight: 1, marginBottom: 20 }}>
                2 minutes.
              </RevealText>
              <RevealText delay={800} style={{ fontSize: 15, color: T.gray, marginBottom: 14 }}>
                That&apos;s how long it takes with HigherUp.
              </RevealText>
              <RevealText delay={1800} style={{ fontSize: 14, color: T.ghost, marginBottom: 20 }}>
                Same products. Same quality.
              </RevealText>
              <RevealText delay={2800} style={{ fontSize: 20, fontWeight: 500, color: T.black }}>
                43 hours → 2 minutes.
              </RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 4 — FORM: Land                                             */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 300, color: T.black, textAlign: 'center', marginBottom: 40 }}>
                Welcome, <span style={{ fontWeight: 400 }}>{form.firstName} {form.lastName}</span>.
              </div>

              {/* Country dropdown */}
              <div style={{ marginBottom: 24 }}>
                <div style={label10}>Country</div>
                <div ref={cRef} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={form.country ? form.country : cQuery}
                    onChange={e => { setCQuery(e.target.value); setForm(f => ({ ...f, country: '' })); setCOpen(true) }}
                    onFocus={() => { if (!form.country) setCOpen(true) }}
                    placeholder="Search country…"
                    style={inputBase}
                    onBlur={e => { e.target.style.borderBottomColor = T.border }}
                  />
                  {cOpen && filteredCountries.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      maxHeight: 200, overflowY: 'auto', zIndex: 50,
                    }}>
                      {filteredCountries.map(c => (
                        <button
                          key={c}
                          onClick={() => { setForm(f => ({ ...f, country: c })); setCOpen(false); setCQuery('') }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '10px 16px', fontSize: 14, color: T.black,
                            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = T.row }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={label10}>Phone number</div>
                  <span style={{ fontSize: 11, color: T.light }}>Optional</span>
                </div>
                <input
                  type="text" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+63 900 000 0000" style={inputBase}
                  onFocus={e => { e.target.style.borderBottomColor = T.black }}
                  onBlur={e  => { e.target.style.borderBottomColor = T.border }}
                />
              </div>

              <div style={{ marginTop: 32 }}>
                <ContinueBtn disabled={!form.country} onClick={goForward} />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 5 — REVEAL 3: Jouw realiteit                               */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <RevealScreen onContinue={goForward} continueDelay={5000}>
              <RevealText delay={0} style={{ fontSize: 14, color: T.ghost, marginBottom: 10 }}>
                The average {form.country || 'VA'} operator earns
              </RevealText>
              <div style={{ fontSize: bigNum(56), fontWeight: 600, color: T.ghost, lineHeight: 1, marginBottom: 10 }}>
                <CountUp end={avgSalary} prefix="$" delay={300} duration={1500} />
              </div>
              <RevealText delay={1000} style={{ fontSize: 14, color: T.ghost, marginBottom: 28 }}>
                per month. 160 hours.
              </RevealText>
              <RevealText delay={2500} style={{ fontSize: 14, color: T.ghost, marginBottom: 10 }}>
                HigherUp operators earn
              </RevealText>
              <div style={{ fontSize: bigNum(56), fontWeight: 600, color: T.black, lineHeight: 1, marginBottom: 10 }}>
                <CountUp end={800} prefix="$" suffix="+" delay={2800} duration={1500} />
              </div>
              <RevealText delay={3500} style={{ fontSize: 15, color: T.gray }}>
                working 3 hours a day.
              </RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 6 — REVEAL 4: De vergelijking                              */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 6 && (
            <RevealScreen onContinue={goForward} continueDelay={5500}>
              <div style={{
                display: 'flex', gap: mobile ? 0 : 32,
                flexDirection: mobile ? 'column' : 'row',
                marginBottom: 40, textAlign: 'left',
              }}>
                {/* WITHOUT column */}
                <div style={{ flex: 1, marginBottom: mobile ? 32 : 0 }}>
                  <RevealText delay={0} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.ghost, marginBottom: 20 }}>
                    Without HigherUp
                  </RevealText>
                  <RevealText delay={300} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: mobile ? 32 : 40, fontWeight: 600, color: T.ghost, lineHeight: 1 }}>1</div>
                    <div style={{ fontSize: 12, color: T.ghost, marginTop: 2 }}>client</div>
                  </RevealText>
                  <RevealText delay={600} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: mobile ? 32 : 40, fontWeight: 600, color: T.ghost, lineHeight: 1 }}>$130</div>
                    <div style={{ fontSize: 12, color: T.ghost, marginTop: 2 }}>per month</div>
                  </RevealText>
                  <RevealText delay={900}>
                    <div style={{ fontSize: mobile ? 32 : 40, fontWeight: 600, color: T.ghost, lineHeight: 1 }}>43</div>
                    <div style={{ fontSize: 12, color: T.ghost, marginTop: 2 }}>hours of work</div>
                  </RevealText>
                </div>

                {/* Divider on desktop */}
                {!mobile && (
                  <RevealText delay={2500} style={{ width: 1, background: T.border, alignSelf: 'stretch' }}>
                    <span />
                  </RevealText>
                )}

                {/* WITH column */}
                <div style={{ flex: 1 }}>
                  <RevealText delay={2500} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.black, marginBottom: 20 }}>
                    With HigherUp
                  </RevealText>
                  <RevealText delay={2800} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: mobile ? 32 : 40, fontWeight: 600, color: T.black, lineHeight: 1 }}>
                      <CountUp end={10} delay={2800} duration={800} />
                    </div>
                    <div style={{ fontSize: 12, color: T.gray, marginTop: 2 }}>clients</div>
                  </RevealText>
                  <RevealText delay={3100} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: mobile ? 32 : 40, fontWeight: 600, color: T.black, lineHeight: 1 }}>
                      <CountUp end={800} prefix="$" delay={3100} duration={900} />
                    </div>
                    <div style={{ fontSize: 12, color: T.gray, marginTop: 2 }}>per month</div>
                  </RevealText>
                  <RevealText delay={3400}>
                    <div style={{ fontSize: mobile ? 32 : 40, fontWeight: 600, color: T.black, lineHeight: 1 }}>
                      <CountUp end={3} delay={3400} duration={700} />
                    </div>
                    <div style={{ fontSize: 12, color: T.gray, marginTop: 2 }}>hours a day</div>
                  </RevealText>
                </div>
              </div>

              <RevealText delay={5000} style={{ fontSize: 16, fontWeight: 500, color: T.black }}>
                Same skills. Same work. 6x the income.
              </RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 7 — FORM: Payout methode                                   */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 7 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 300, color: T.black, textAlign: 'center', marginBottom: 40 }}>
                Almost there, <span style={{ fontWeight: 400 }}>{form.firstName}</span>.
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={label10}>How should we pay you</div>
                <div style={{ fontSize: 12, color: T.light, marginBottom: 16 }}>For affiliate earnings and bonuses</div>
                <div style={label10}>Payout method</div>
                <select
                  value={form.paymentMethod}
                  onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value, paymentDetails: {} }))}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    borderBottom: `1.5px solid ${T.border}`, outline: 'none',
                    fontSize: 16, color: form.paymentMethod ? T.black : T.ghost,
                    paddingBottom: 12, paddingTop: 6, fontFamily: 'inherit', cursor: 'pointer',
                  }}
                  onFocus={e => { e.target.style.borderBottomColor = T.black }}
                  onBlur={e  => { e.target.style.borderBottomColor = T.border }}
                >
                  <option value="">Select a method</option>
                  {getPaymentMethods(form.country).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              {renderPaymentDetails()}
              <div style={{ marginTop: 32 }}>
                <ContinueBtn disabled={!isPaymentReady()} onClick={goForward} />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 8 — REVEAL 5: Eén upload                                   */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 8 && (
            <RevealScreen onContinue={goForward} continueDelay={5000}>
              <RevealText delay={0}    style={{ fontSize: 16, color: T.gray, marginBottom: 12 }}>You upload a file.</RevealText>
              <RevealText delay={800}  style={{ fontSize: 16, color: T.gray, marginBottom: 12 }}>HigherUp optimizes 200 products.</RevealText>
              <RevealText delay={1600} style={{ fontSize: 16, color: T.gray, marginBottom: 32 }}>You deliver to your client.</RevealText>
              <RevealText delay={2800} style={{ fontSize: 14, color: T.ghost, marginBottom: 8 }}>You earned</RevealText>
              <div style={{ fontSize: bigNum(64), fontWeight: 600, color: T.green, lineHeight: 1, marginBottom: 12 }}>
                <CountUp end={130} prefix="$" delay={3000} duration={1200} />
              </div>
              <RevealText delay={4000} style={{ fontSize: 16, color: T.gray }}>in 2 minutes.</RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 9 — REVEAL 6: Tien clients                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 9 && (
            <RevealScreen onContinue={goForward} continueDelay={7500}>
              <RevealText delay={0}    style={{ fontSize: 16, color: T.gray, marginBottom: 24 }}>Now imagine 10 clients.</RevealText>
              <RevealText delay={1200} style={{ fontSize: 15, color: T.ghost, marginBottom: 24 }}>10 uploads. 20 minutes total.</RevealText>
              <RevealText delay={2200} style={{ fontSize: 14, color: T.ghost, marginBottom: 8 }}>You earned</RevealText>
              <div style={{ fontSize: bigNum(64), fontWeight: 600, color: T.green, lineHeight: 1, marginBottom: 12 }}>
                <CountUp end={1300} prefix="$" delay={2400} duration={2000} />
              </div>
              <RevealText delay={3800} style={{ fontSize: 16, color: T.gray, marginBottom: 24 }}>this month.</RevealText>
              <RevealText delay={4500} style={{ fontSize: 14, color: T.ghost, marginBottom: 16 }}>HigherUp share: $500</RevealText>
              <RevealText delay={5200} style={{ fontSize: 14, color: T.ghost, marginBottom: 8 }}>Your profit</RevealText>
              <div style={{ fontSize: bigNum(48), fontWeight: 600, color: T.green, lineHeight: 1, marginBottom: 12 }}>
                <CountUp end={800} prefix="$" delay={5400} duration={1500} />
              </div>
              <RevealText delay={6500} style={{ fontSize: 14, color: T.gray }}>Working from home.</RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 10 — REVEAL 7: Het jaarperspectief                         */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 10 && (
            <RevealScreen onContinue={goForward} continueDelay={8500}>
              <RevealText delay={0} style={{ fontSize: 18, fontWeight: 300, color: T.black, marginBottom: 40 }}>
                Your first year, {form.firstName}.
              </RevealText>

              {/* Month 1 */}
              <div style={{ marginBottom: 24 }}>
                <RevealText delay={1200} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.ghost, marginBottom: 4 }}>Month 1</RevealText>
                <div style={{ fontSize: mobile ? 28 : 36, fontWeight: 600, color: T.black, lineHeight: 1, marginBottom: 2 }}>
                  <CountUp end={240} prefix="$" delay={1400} duration={900} />
                </div>
                <RevealText delay={1600} style={{ fontSize: 12, color: T.ghost }}>3 clients</RevealText>
              </div>

              {/* Month 6 */}
              <div style={{ marginBottom: 24 }}>
                <RevealText delay={2500} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.ghost, marginBottom: 4 }}>Month 6</RevealText>
                <div style={{ fontSize: mobile ? 28 : 36, fontWeight: 600, color: T.black, lineHeight: 1, marginBottom: 2 }}>
                  <CountUp end={640} prefix="$" delay={2700} duration={1000} />
                </div>
                <RevealText delay={2900} style={{ fontSize: 12, color: T.ghost }}>8 clients</RevealText>
              </div>

              {/* Month 12 */}
              <div style={{ marginBottom: 36 }}>
                <RevealText delay={3800} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.ghost, marginBottom: 4 }}>Month 12</RevealText>
                <div style={{ fontSize: mobile ? 36 : 44, fontWeight: 600, color: T.green, lineHeight: 1, marginBottom: 2 }}>
                  <CountUp end={975} prefix="$" delay={4000} duration={1200} />
                </div>
                <RevealText delay={4200} style={{ fontSize: 12, color: T.ghost }}>15 clients</RevealText>
              </div>

              <RevealText delay={5500} style={{ fontSize: 20, fontWeight: 500, color: T.black, marginBottom: 20 }}>
                $11,700 in your first year.
              </RevealText>
              <RevealText delay={6500} style={{ fontSize: 15, color: T.gray, marginBottom: 12 }}>
                You&apos;re not getting a job, {form.firstName}.
              </RevealText>
              <RevealText delay={7500} style={{ fontSize: 17, fontWeight: 500, color: T.black }}>
                You&apos;re building a business.
              </RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 11 — FORM: Referral code                                   */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 11 && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 300, color: T.black, textAlign: 'center', marginBottom: 40 }}>
                One more thing, <span style={{ fontWeight: 400 }}>{form.firstName}</span>.
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={label10}>Referral code</div>
                <div style={{ fontSize: 13, color: T.gray, marginBottom: 16 }}>Were you referred by someone?</div>
                <input
                  type="text"
                  value={form.referralCode}
                  onChange={e => setForm(f => ({ ...f, referralCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g. JOHN-3F8A"
                  style={inputBase}
                  onFocus={e => { e.target.style.borderBottomColor = T.black }}
                  onBlur={e  => { e.target.style.borderBottomColor = T.border }}
                />
                <div style={{ marginTop: 8, minHeight: 20 }}>
                  {refState === 'valid' && refName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: T.green }}>Referred by {refName}</span>
                    </div>
                  )}
                  {refState === 'invalid' && form.referralCode.trim() && (
                    <span style={{ fontSize: 12, color: T.gray }}>Code not recognized</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11, color: T.light, marginTop: 8, marginBottom: 40 }}>
                Don&apos;t have a code? No problem. You can skip this.
              </div>
              <ContinueBtn label="Continue" onClick={goForward} />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 12 — REVEAL 8: Je start nu                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 12 && (
            <RevealScreen
              onContinue={handleSubmit}
              continueDelay={6000}
              continueText="Almost done"
              loading={submitting}
            >
              <RevealText delay={0}    style={{ fontSize: 16, color: T.gray, marginBottom: 10 }}>No signup fees.</RevealText>
              <RevealText delay={600}  style={{ fontSize: 16, color: T.gray, marginBottom: 10 }}>No experience needed.</RevealText>
              <RevealText delay={1200} style={{ fontSize: 16, color: T.gray, marginBottom: 40 }}>No risk.</RevealText>
              <RevealText delay={2500} style={{ fontSize: 16, color: T.black, marginBottom: 8 }}>You upload.</RevealText>
              <RevealText delay={3000} style={{ fontSize: 16, color: T.black, marginBottom: 8 }}>We optimize.</RevealText>
              <RevealText delay={3500} style={{ fontSize: 18, fontWeight: 500, color: T.black, marginBottom: 48 }}>You earn.</RevealText>
              <RevealText delay={5000} style={{ fontSize: 24, fontWeight: 600, color: T.black }}>Let&apos;s go.</RevealText>
            </RevealScreen>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 13 — BEVESTIGING                                           */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 13 && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <RevealText delay={0} style={{ fontSize: 32, fontWeight: 300, color: T.black, marginBottom: 56 }}>
                You&apos;re in, {form.firstName}.
              </RevealText>
              <RevealText delay={1000} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.ghost, marginBottom: 16 }}>
                Your login code
              </RevealText>
              <RevealText delay={1200} style={{ fontSize: 56, fontWeight: 600, color: T.black, letterSpacing: '0.1em', marginBottom: 16 }}>
                {loginCode ?? '——'}
              </RevealText>

              <button
                onClick={() => {
                  if (loginCode) {
                    navigator.clipboard.writeText(loginCode)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: copied ? T.green : T.ghost,
                  fontFamily: 'inherit', padding: 0, transition: 'color 0.15s',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>

              <RevealText delay={2000} style={{ fontSize: 14, color: T.gray, marginTop: 28 }}>
                Save this code. You need it every time you sign in.
              </RevealText>
              <RevealText delay={2500}>
                <a href="/" style={{ display: 'block', fontSize: 14, color: T.black, marginTop: 40, textDecoration: 'underline' }}>
                  Go to sign in →
                </a>
              </RevealText>
            </div>
          )}

        </div>
      </div>

      {/* ── Progress bar (fixed bottom) ────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 2,
        background: '#F5F5F7', zIndex: 100,
      }}>
        <div style={{
          height: '100%', background: T.black,
          width: `${(step / TOTAL_STEPS) * 100}%`,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}
